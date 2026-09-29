# Delivery Routing & Scheduling com Greed - Stock.io

Número da Lista: 2<br>
Conteúdo da Disciplina: Greed (Algoritmos Ambiciosos)<br>

## Alunos

| Foto | Nome | Matrícula |
| :---: | :--- | ---: |
| ![Johnnatan Salles](https://github.com/jsalless.png?size=100) | **Johnnatan Salles** | 241011330 |
| ![Julia Gabriella](https://github.com/juliagabriellafs.png?size=100) | **Julia Gabriella** | 241036142 |

## Sobre

Este projeto foi desenvolvido para a disciplina de **Projeto de Algoritmos (PA) - 2026.2**, com foco na aplicação prática de **Algoritmos Ambiciosos (Greedy Algorithms)** e integração com teoria de grafos no mundo real.

A aplicação simula o ecossistema de logística e entregas da plataforma **stock.io**, integrando dados reais do **OpenStreetMap** e resolvendo o problema clássico de agendamento de tarefas: **Scheduling to Minimize Lateness** (Minimização do Atraso Máximo).

O sistema organiza a agenda do entregador quando ele pega um lote com múltiplos pedidos simultâneos, garantindo matematicamente o menor atraso máximo possível através da regra gulosa **Earliest Deadline First (EDF)**. Em seguida, a rota contínua em cadeia é traçada no mapa real conectando sequencialmente os clientes na ordem ótima gerada pelo algoritmo, calculando os tempos reais de deslocamento e exibindo uma timeline lateral interativa.

---

## Funcionalidades e Algoritmos

### 1. Algoritmo Ambicioso: Minimize Lateness (Fila de Entregas)
* **Objetivo:** Organizar o cronograma de atendimento do entregador ao assumir um lote de pedidos com prazos limites (deadlines) distintos.
* **Regra Gulosa:** **Earliest Deadline First (EDF)** — os pedidos são ordenados estritamente em ordem crescente de seus prazos de entrega ($d_1 \le d_2 \le \dots \le d_n$), independentemente da duração estimada da viagem.
* **Formulação Matemática:**
  * Dado um conjunto de pedidos com tempos de viagem/atendimento $t_i$ e prazos $d_i$.
  * Tempo de término do pedido $i$: $f_i = s_i + t_i$.
  * Atraso individual (lateness): $l_i = \max(0, f_i - d_i)$.
  * Atraso máximo do lote: $L_{\max} = \max_{i} l_i$.
* **Complexidade de Tempo:** $O(n \log n)$, dominada pela ordenação dos prazos.
* **Garantia Teórica de Optimalidade:** Provado por Jon Kleinberg e Éva Tardos (*Algorithm Design*, Capítulo 4) através do método do **argumento da troca de inversões (Exchange Argument)**: qualquer agendamento sem tempo ocioso que contenha uma inversão pode ter pedidos adjacentes invertidos sem aumentar o atraso máximo, demonstrando que o agendamento guloso por deadline é estritamente ótimo.

### 2. Traçado da Rota Contínua em Cadeia (Chain Routing)
* Após a definição da fila pelo Minimize Lateness, o sistema traça uma **rota contínua** conectando:
  $$\text{Origem (Galpão)} \longrightarrow \text{Cliente 1} \longrightarrow \text{Cliente 2} \longrightarrow \dots \longrightarrow \text{Cliente } N$$
* Para cada trecho consecutivo, o menor caminho viário é calculado utilizando os algoritmos de **Dijkstra** ou **Bellman-Ford**.
* O custo retornado pelo algoritmo para cada segmento (distância e tempo em minutos baseado no veículo) alimenta o cálculo do cronograma, permitindo determinar com exatidão se houve atraso e a folga (slack) de cada parada.

### 3. Calendário de Entregas & Timeline Lateral Interativa
* **Calendário & Lote:** O entregador pode visualizar os pedidos disponíveis, selecionar múltiplos pedidos com checkboxes e ajustar prazos limites para simular cenários.
* **Timeline Lateral:** Exibe a agenda detalhada passo a passo com horário de saída do depósito, horários de chegada previstos, deadlines prometidos e alertas de atraso.
* **Painel Comparativo Didático:** Compara em tempo real a regra gulosa (EDF) contra estratégias ingênuas como **FIFO (Ordem de Chegada)** e **SPT (Shortest Processing Time)**, demonstrando empiricamente a superioridade do algoritmo de Greed.
* **Visualização no Mapa:** Marcadores numerados (1, 2, 3...) e rota contínua destacada com animação de fluxo.

---

## Comparativo Teórico de Heurísticas

| Estratégia | Regra de Ordenação | Atraso Máximo ($L_{\max}$) | Optimalidade |
| :--- | :--- | :--- | :--- |
| **Minimize Lateness (EDF)** | Menor deadline primeiro ($d_i$) | **Mínimo possível** | **Ótima Comprovada** |
| **FIFO** | Ordem de chegada / criação | Alto (sacrifica prazos urgentes) | Não-ótima |
| **SPT (Shortest Processing Time)** | Menor tempo de viagem ($t_i$) | Alto (adia entregas distantes com prazos curtos) | Não-ótima |

---

## Tecnologias Utilizadas

### Frontend
- **Framework:** Next.js com React 19
- **Linguagem:** TypeScript
- **Estilização:** TailwindCSS
- **Mapas:** Leaflet + React-Leaflet
- **Geocoding:** ViaCEP + OpenStreetMap (Nominatim)

### Backend
- **Framework:** FastAPI
- **Linguagem:** Python 3.11+
- **Algoritmos:** Implementações puras de Minimize Lateness, Dijkstra, Bellman-Ford e Min-Heap
- **Banco de Dados:** Prisma ORM com SQLite / PostgreSQL e resiliência com dados de demonstração

---

## Instalação e Execução

### 1. Clonando o Repositório

```bash
git clone https://github.com/projeto-de-algoritmos-2026/G7_Greed_PA-26.2.git
cd G7_Greed_PA-26.2
```

### 2. Configurando o Backend (Python / FastAPI)

Abra um terminal na pasta `backend`:

```bash
cd backend
python -m venv venv
.\venv\Scripts\activate   # No Windows (ou source venv/bin/activate no Linux/Mac)
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
> API disponível em: `http://localhost:8000` (Documentação interativa em `http://localhost:8000/docs`).

### 3. Configurando o Frontend (Node / Next.js)

Abra outro terminal na pasta `frontend`:

```bash
cd frontend
npm install
npm run dev
```
> Acesse a aplicação em: `http://localhost:3000`.

---

## Como Utilizar o Calendário de Entregas (Passo a Passo)

1. Acesse `http://localhost:3000` no navegador.
2. No menu superior, clique em **📅 CALENDÁRIO** ou acesse diretamente `/entregador/calendario` (ou faça login como entregador e acesse a lista de pedidos em `/orders`).
3. No painel de **Parâmetros do Lote**, confira o CEP de Origem (Depósito), o horário de saída (ex: `09:00`) e selecione o meio de transporte (Moto, Carro, Bike).
4. Na lista de pedidos, selecione os pedidos desejados para compor o lote.
5. *(Opcional)* Altere o horário limite (deadline) de qualquer cliente no campo de horário para simular situações de folga ou risco.
6. Clique no botão **"⚡ Organizar Fila (Minimize Lateness)"**.
7. O sistema irá:
   - Ordenar a fila de entregas pela regra gulosa do prazo mais próximo.
   - Traçar a rota em cadeia ligando os clientes sequencialmente (Origem $\to$ 1 $\to$ 2 $\to$ 3...).
   - Calcular os custos reais de deslocamento e gerar a timeline lateral com os horários e possíveis atrasos.
   - Desenhar a rota contínua no mapa com marcadores numerados.
8. Clique em **"Ver Comparativo (Greed vs Outros)"** para visualizar a comparação direta contra FIFO e SPT.
