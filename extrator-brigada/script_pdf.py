import firebase_admin
from firebase_admin import credentials, firestore
from fpdf import FPDF
from datetime import datetime
import pandas as pd
import os
import json
import re

# 1. Configuração do Firebase com autenticação flexível e segura
service_account_path = "serviceAccountKey.json"
if not os.path.exists(service_account_path):
    service_account_path = "extrator-brigada/serviceAccountKey.json"

if os.path.exists(service_account_path):
    cred = credentials.Certificate(service_account_path)
elif "FIREBASE_SERVICE_ACCOUNT_JSON" in os.environ:
    try:
        info = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"])
        cred = credentials.Certificate(info)
    except Exception as e:
        print(f"Erro ao carregar credenciais da variável FIREBASE_SERVICE_ACCOUNT_JSON: {e}")
        cred = None
else:
    try:
        cred = credentials.ApplicationDefault()
    except Exception as e:
        print(f"Aviso: Não foi possível obter credenciais padrão ({e}).")
        cred = None

if cred:
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
else:
    raise Exception("Erro crítico: Nenhuma credencial do Firebase configurada. Adicione 'serviceAccountKey.json' ou defina a variável 'FIREBASE_SERVICE_ACCOUNT_JSON'.")

# 2. Puxar dados do inventário (para obter localização e tipo) e vistorias
print("Carregando inventário de extintores...")
inventario_ref = db.collection('artifacts', 'brigadantb', 'public', 'data', 'inventario')
inventario_docs = inventario_ref.stream()
map_inventario = {}
for doc in inventario_docs:
    inv_data = doc.to_dict()
    map_inventario[doc.id.strip().upper()] = {
        'local': inv_data.get('local', 'Local não especificado'),
        'tipo': inv_data.get('tipoKgL') or inv_data.get('tipo') or 'Tipo não especificado'
    }

print("Carregando inspeções...")
inspecoes_ref = db.collection('artifacts', 'brigadantb', 'public', 'data', 'inspecoes')
docs = inspecoes_ref.stream()

# 3. Filtrar, limpar e enriquecer dados
lista_inspecoes = []
for doc in docs:
    data = doc.to_dict()
    id_ext = data.get('idExtintor', '')
    # Ignora dados de teste
    if not id_ext or 'teste' in id_ext.lower():
        continue
    
    # Enriquece o registro da vistoria com dados do inventário
    ext_key = id_ext.strip().upper()
    inv_info = map_inventario.get(ext_key, {'local': 'Local não cadastrado', 'tipo': 'Tipo não cadastrado'})
    data['local'] = inv_info['local']
    data['tipo'] = inv_info['tipo']
    
    lista_inspecoes.append(data)

# 4. Ordenação alfanumérica consistente
def chave_ordenacao(item):
    id_ext = item.get('idExtintor', '')
    match = re.search(r'\d+', id_ext)
    return int(match.group()) if match else 9999

lista_inspecoes.sort(key=chave_ordenacao)

# Mapeamento do checklist para termos amigáveis sem acentuação (segurança para FPDF)
MAP_CHECKLIST = {
    'acesso': 'Desobstrucao e Acesso',
    'sinalizacaoParede': 'Sinalizacao de Parede (Placa)',
    'sinalizacaoPiso': 'Sinalizacao de Piso (Pintura)',
    'suporte': 'Suporte e Altura de Fixacao',
    'cilindro': 'Casco / Cilindro Sem Corrosao',
    'instrucoes': 'Quadro de Instrucoes Legivel',
    'mangueira': 'Mangueira e Bico / Difusor',
    'lacre': 'Lacre de Seguranca Intacto',
    'trava': 'Trava de Seguranca / Pino',
    'manometro': 'Manometro na Faixa Verde'
}

# 5. Separar em dois grupos com base na conformidade total
conformes = []
nao_conformes = []

for item in lista_inspecoes:
    conformidade = item.get('conformidade', {})
    if not conformidade:
        nao_conformes.append(item)
        continue
    
    # Se algum item for "Não Conforme", vai para não conformes
    tem_erro = any(v == 'Não Conforme' for v in conformidade.values())
    if tem_erro:
        nao_conformes.append(item)
    else:
        conformes.append(item)

# 6. Gerar a lista final consolidada ordenada
lista_final_ordenada = conformes + nao_conformes

# 7. Gerar o PDF Modernizado
class RelatorioPDF(FPDF):
    def header(self):
        # Banner superior escuro
        self.set_fill_color(22, 30, 49) # #161E31
        self.rect(0, 0, 210, 32, 'F')
        
        # Linha inferior de destaque em vermelho
        self.set_fill_color(239, 68, 68) # #EF4444
        self.rect(0, 31, 210, 1, 'F')
        
        # Título
        self.set_xy(10, 8)
        self.set_text_color(255, 255, 255)
        self.set_font('Helvetica', 'B', 15)
        self.cell(0, 6, 'NIBT BRIGADA - RELATORIO DE VISTORIAS', 0, 1, 'L')
        
        # Subtítulo
        self.set_font('Helvetica', '', 9)
        self.set_text_color(203, 213, 225)
        self.cell(0, 4, 'Controle de Inventario, Validade e Conformidade de Extintores', 0, 1, 'L')
        
        # Data de Geração
        self.set_xy(150, 12)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(148, 163, 184)
        self.cell(50, 4, f"Gerado em: {datetime.now().strftime('%d/%m/%Y %H:%M')}", 0, 0, 'R')
        
        # Resetar o cursor Y para evitar sobreposição nas quebras de página automáticas
        self.set_y(38)

    def footer(self):
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(100, 116, 139)
        self.cell(0, 10, 'NIBT Brigada - Painel Operacional', 0, 0, 'L')
        self.cell(0, 10, f'Pagina {self.page_no()}/{{nb}}', 0, 0, 'R')

print("Gerando relatório PDF...")
pdf = RelatorioPDF()
pdf.alias_nb_pages()
pdf.set_margins(10, 40, 10)
pdf.add_page()

# Painel Resumo (Dashboard de métricas)
total_inspecionados = len(lista_inspecoes)
qtd_conf = len(conformes)
qtd_nconf = len(nao_conformes)
taxa_conformidade = f"{int(qtd_conf / total_inspecionados * 100)}%" if total_inspecionados > 0 else "0%"

pdf.set_fill_color(248, 250, 252) # Slate 50
pdf.set_draw_color(226, 232, 240) # Slate 200
pdf.rect(10, 40, 190, 22, 'DF')

# Métricas do Dashboard
pdf.set_xy(10, 42)
pdf.set_font('Helvetica', '', 8)
pdf.set_text_color(100, 116, 139)
pdf.cell(47, 4, 'TOTAL INSPECIONADOS', 0, 0, 'C')
pdf.cell(47, 4, 'EM CONFORMIDADE', 0, 0, 'C')
pdf.cell(47, 4, 'NAO CONFORMES', 0, 0, 'C')
pdf.cell(49, 4, 'TAXA DE CONFORMIDADE', 0, 1, 'C')

pdf.set_x(10)
pdf.set_font('Helvetica', 'B', 12)
pdf.set_text_color(30, 41, 59)
pdf.cell(47, 8, str(total_inspecionados), 0, 0, 'C')
pdf.set_text_color(21, 128, 61) # Verde
pdf.cell(47, 8, str(qtd_conf), 0, 0, 'C')
pdf.set_text_color(185, 28, 28) # Vermelho
pdf.cell(47, 8, str(qtd_nconf), 0, 0, 'C')
pdf.set_text_color(30, 41, 59)
pdf.cell(49, 8, taxa_conformidade, 0, 1, 'C')

# Espaço após o dashboard
pdf.set_y(70)

# --- SEÇÃO 1: NÃO CONFORMES ---
pdf.set_font('Helvetica', 'B', 11)
pdf.set_text_color(185, 28, 28)
pdf.cell(0, 6, '1. DETALHES DE EXTINTORES NAO CONFORMES (ACAO REQUERIDA)', 0, 1, 'L')
pdf.ln(2)

if not nao_conformes:
    pdf.set_font('Helvetica', 'I', 10)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(0, 8, 'Parabens! Nenhum extintor apresenta pendencias ou inconformidades.', 0, 1, 'L')
    pdf.ln(5)
else:
    for item in nao_conformes:
        # Calcular altura estimada do card para evitar que ele seja partido entre páginas
        altura_estimada = 18  # base (cabeçalho + vencimentos + borda/margem)
        conformidade = item.get('conformidade', {})
        pendencias = [k for k, v in conformidade.items() if v == 'Não Conforme']
        if pendencias:
            altura_estimada += 5 + (4 * len(pendencias))
        obs = item.get('observacoes', '').strip()
        if obs:
            altura_estimada += 5
            
        # Se o card não couber no espaço restante da página atual, força uma quebra
        if pdf.get_y() + altura_estimada > 275:
            pdf.add_page()

        # Cabeçalho do Card
        pdf.set_fill_color(254, 226, 226) # Vermelho muito claro
        pdf.set_draw_color(252, 165, 165) # Vermelho suave
        pdf.set_text_color(153, 27, 27) # Vermelho escuro
        pdf.set_font('Helvetica', 'B', 9)
        
        id_ext = item.get('idExtintor', '')
        local = item.get('local', 'Local não especificado')
        tipo = item.get('tipo', 'Tipo não especificado')
        brigadista = item.get('nomeBrigadista', 'N/A')
        data_insp = item.get('dataInspecao', 'N/A')
        try:
            data_insp = datetime.strptime(data_insp, '%Y-%m-%d').strftime('%d/%m/%Y')
        except:
            pass
            
        pdf.cell(190, 7, f" {id_ext} - {local}  ({tipo})  |  Brigadista: {brigadista}  |  Data: {data_insp}", 1, 1, 'L', True)
        
        # Corpo do Card (Vencimentos)
        pdf.set_text_color(51, 65, 85)
        pdf.set_font('Helvetica', '', 8.5)
        venc_recarga = item.get('vencimentoRecarga', 'N/A')
        venc_hidro = item.get('vencimentoHidrostatico', 'N/A')
        try:
            venc_recarga = datetime.strptime(venc_recarga, '%Y-%m-%d').strftime('%d/%m/%Y')
        except:
            pass
        try:
            venc_hidro = datetime.strptime(venc_hidro, '%Y-%m-%d').strftime('%d/%m/%Y')
        except:
            pass
            
        pdf.cell(190, 6, f"  Vencimento da Recarga: {venc_recarga}   |   Teste Hidrostatico: {venc_hidro}", 'LR', 1, 'L')
        
        # Pendenças
        conformidade = item.get('conformidade', {})
        pendencias = [MAP_CHECKLIST.get(k, k) for k, v in conformidade.items() if v == 'Não Conforme']
        
        pdf.set_text_color(220, 38, 38)
        pdf.set_font('Helvetica', 'B', 8)
        if pendencias:
            pdf.cell(190, 5, "  PENDENCIAS IDENTIFICADAS:", 'LR', 1, 'L')
            pdf.set_font('Helvetica', '', 8)
            for p in pendencias:
                pdf.cell(190, 4, f"    - {p}", 'LR', 1, 'L')
        else:
            pdf.cell(190, 5, "  PENDENCIAS IDENTIFICADAS: Sem dados de checklist ou vistoria nao finalizada.", 'LR', 1, 'L')
            
        # Observações
        obs = item.get('observacoes', '').strip()
        if obs:
            pdf.set_text_color(100, 116, 139)
            pdf.set_font('Helvetica', 'I', 8)
            pdf.cell(190, 5, f"  Observacoes: {obs}", 'LR', 1, 'L')
            
        # Linha inferior do card
        pdf.cell(190, 2, "", 'T', 1, 'L')
        pdf.ln(3)

# --- SEÇÃO 2: EM CONFORMIDADE ---
# Verifica se há espaço suficiente (mínimo 25mm) para o título da seção + cabeçalho da tabela + 2 linhas
if pdf.get_y() + 25 > 275:
    pdf.add_page()

pdf.ln(3)
pdf.set_font('Helvetica', 'B', 11)
pdf.set_text_color(21, 128, 61)
pdf.cell(0, 6, '2. DETALHES DE EXTINTORES EM CONFORMIDADE (OK)', 0, 1, 'L')
pdf.ln(2)

if not conformes:
    pdf.set_font('Helvetica', 'I', 10)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(0, 8, 'Nenhum extintor em conformidade no momento.', 0, 1, 'L')
else:
    # Tabela de Extintores em Conformidade
    pdf.set_fill_color(220, 252, 231) # Verde muito claro
    pdf.set_draw_color(134, 239, 172) # Verde suave
    pdf.set_text_color(21, 128, 61)
    pdf.set_font('Helvetica', 'B', 8.5)
    
    # Cabeçalho da tabela
    pdf.cell(20, 7, 'Codigo', 1, 0, 'C', True)
    pdf.cell(60, 7, 'Localizacao', 1, 0, 'C', True)
    pdf.cell(35, 7, 'Tipo', 1, 0, 'C', True)
    pdf.cell(25, 7, 'Brigadista', 1, 0, 'C', True)
    pdf.cell(25, 7, 'Vistoria', 1, 0, 'C', True)
    pdf.cell(25, 7, 'Recarga', 1, 1, 'C', True)
    
    pdf.set_text_color(51, 65, 85)
    pdf.set_font('Helvetica', '', 8)
    pdf.set_draw_color(226, 232, 240)
    
    zebra = False
    for item in conformes:
        id_ext = item.get('idExtintor', '')
        local = item.get('local', 'Local não especificado')
        tipo = item.get('tipo', 'Tipo não especificado')
        brigadista = item.get('nomeBrigadista', 'N/A')
        data_insp = item.get('dataInspecao', 'N/A')
        venc_recarga = item.get('vencimentoRecarga', 'N/A')
        
        try:
            data_insp = datetime.strptime(data_insp, '%Y-%m-%d').strftime('%d/%m/%Y')
        except:
            pass
        try:
            venc_recarga = datetime.strptime(venc_recarga, '%Y-%m-%d').strftime('%d/%m/%Y')
        except:
            pass
            
        pdf.set_fill_color(248, 250, 252) if zebra else pdf.set_fill_color(255, 255, 255)
        zebra = not zebra
        
        pdf.cell(20, 6, id_ext, 1, 0, 'C', True)
        pdf.cell(60, 6, f" {local}", 1, 0, 'L', True)
        pdf.cell(35, 6, f" {tipo}", 1, 0, 'C', True)
        pdf.cell(25, 6, f" {brigadista}", 1, 0, 'L', True)
        pdf.cell(25, 6, data_insp, 1, 0, 'C', True)
        pdf.cell(25, 6, venc_recarga, 1, 1, 'C', True)

pdf.output("Relatorio_Brigada.pdf")
print("PDF gerado com sucesso: Relatorio_Brigada.pdf")

# 7. Gerar Planilha Excel Organizada com openpyxl
if lista_final_ordenada:
    print("Gerando planilha Excel estilizada...")
    linhas_planilha = []
    
    for item in lista_final_ordenada:
        is_conf = all(v == "Conforme" for v in item.get('conformidade', {}).values()) if item.get('conformidade') else False
        status_geral = 'Conforme' if is_conf else 'Não Conforme'
        
        row_data = {
            'Código': item.get('idExtintor', ''),
            'Localização': item.get('local', ''),
            'Tipo': item.get('tipo', ''),
            'Status Geral': status_geral,
            'Data da Vistoria': item.get('dataInspecao', ''),
            'Brigadista': item.get('nomeBrigadista', ''),
            'E-mail Brigadista': item.get('emailBrigadista', ''),
            'Vencimento Recarga': item.get('vencimentoRecarga', ''),
            'Vencimento Teste Hidrostático': item.get('vencimentoHidrostatico', ''),
            'Observações': item.get('observacoes', '')
        }
        
        # Adiciona colunas amigáveis do checklist
        conformidade = item.get('conformidade', {})
        for key_db, label_friendly in MAP_CHECKLIST.items():
            row_data[label_friendly] = conformidade.get(key_db, 'N/A')
            
        linhas_planilha.append(row_data)
        
    df_final = pd.DataFrame(linhas_planilha)
    
    file_name = "Relatorio_Brigada.xlsx"
    with pd.ExcelWriter(file_name, engine='openpyxl') as writer:
        df_final.to_excel(writer, index=False, sheet_name='Vistorias')
        
        # Puxa workbook e sheet
        workbook = writer.book
        worksheet = writer.sheets['Vistorias']
        
        # Estilos openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        
        # Paleta de Cores e Fontes
        header_fill = PatternFill(start_color='1F4E79', end_color='1F4E79', fill_type='solid') # Azul escuro corporativo
        header_font = Font(name='Segoe UI', size=11, bold=True, color='FFFFFF')
        
        row_zebra_fill = PatternFill(start_color='F2F6F9', end_color='F2F6F9', fill_type='solid') # Cinza azulado claro
        conf_fill = PatternFill(start_color='E2F0D9', end_color='E2F0D9', fill_type='solid') # Verde claro pastel
        nconf_fill = PatternFill(start_color='FCE4D6', end_color='FCE4D6', fill_type='solid') # Vermelho claro pastel
        
        thin_border = Border(
            left=Side(style='thin', color='D9D9D9'),
            right=Side(style='thin', color='D9D9D9'),
            top=Side(style='thin', color='D9D9D9'),
            bottom=Side(style='thin', color='D9D9D9')
        )
        
        # Formatar Cabeçalho da Planilha
        for col_idx in range(1, len(df_final.columns) + 1):
            cell = worksheet.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
            cell.border = thin_border
            
        # Formatar Linhas de Dados
        for row_idx in range(2, len(df_final) + 2):
            use_zebra = (row_idx % 2 == 0)
            status_val = worksheet.cell(row=row_idx, column=4).value # Status Geral está na col 4 (Código, Local, Tipo, Status)
            
            for col_idx in range(1, len(df_final.columns) + 1):
                cell = worksheet.cell(row=row_idx, column=col_idx)
                cell.font = Font(name='Segoe UI', size=10)
                cell.border = thin_border
                
                # Alinhamento
                if col_idx in [1, 4, 5, 8, 9]: # Código, Status, Datas
                    cell.alignment = Alignment(horizontal='center', vertical='center')
                else:
                    cell.alignment = Alignment(horizontal='left', vertical='center')
                
                # Formatação Condicional do Status Geral
                if col_idx == 4: # Coluna "Status Geral"
                    if status_val == 'Conforme':
                        cell.fill = conf_fill
                        cell.font = Font(name='Segoe UI', size=10, bold=True, color='375623')
                    else:
                        cell.fill = nconf_fill
                        cell.font = Font(name='Segoe UI', size=10, bold=True, color='C65911')
                elif use_zebra:
                    cell.fill = row_zebra_fill
                    
        # Altura das Linhas
        worksheet.row_dimensions[1].height = 30
        for r in range(2, len(df_final) + 2):
            worksheet.row_dimensions[r].height = 20
            
        # Auto-ajuste de largura das colunas
        for col in worksheet.columns:
            max_len = 0
            col_letter = col[0].column_letter
            for cell in col:
                val = str(cell.value or '')
                # Limita tamanho para não ficar excessivamente largo em colunas de observação
                if col_letter == 'J': # Observações
                    max_len = max(max_len, min(len(val), 30))
                else:
                    max_len = max(max_len, len(val))
            worksheet.column_dimensions[col_letter].width = max(max_len + 3, 12)
            
    print("Planilha Excel gerada com sucesso: Relatorio_Brigada.xlsx")