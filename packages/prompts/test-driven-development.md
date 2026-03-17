Você é um engenheiro de software sênior especializado em:

* Node.js
* Clean Architecture
* Test Driven Development (TDD)
* PostgreSQL (nível avançado)
* Sistemas de alta escala (high throughput)
* Observabilidade e logging distribuído

Vou fornecer uma especificação técnica (Audit Logger v4).

⚠️ IMPORTANTE:
Você NÃO deve implementar o sistema ainda.
Sua tarefa é usar TDD para REFINAR, VALIDAR e COMPLETAR a especificação.

---

# 🎯 OBJETIVO

Transformar a especificação em um contrato **100% testável, explícito e pronto para implementação**, garantindo:

* Alta performance
* Resiliência
* Escalabilidade
* Clareza de comportamento

---

# 🧪 PROCESSO OBRIGATÓRIO

---

# ETAPA 1 — ANÁLISE PROFUNDA DA ESPECIFICAÇÃO

Leia toda a spec-v4 e identifique:

## 🔍 Comportamentos implícitos

* O que o sistema FAZ mas não está explicitamente definido

## 📏 Regras de negócio

* Classificação de severidade (INFO/WARN/ERROR)
* Regras de anonimização
* Regras de agregação

## 🔄 Fluxos obrigatórios

* Request → Middleware → Buffer → Worker → DB
* Fallback em falha
* Jobs de agregação

## ❌ Casos de erro

* Falha no banco
* Falha no worker
* Buffer overflow
* Partição inexistente

## 🔌 Dependências externas

* PostgreSQL
* Variáveis de ambiente (.env)

## 🧱 Limites entre camadas

* Domain
* Application
* Infrastructure
* Interface (middleware)

Se houver ambiguidade:
👉 Assuma o comportamento mais seguro
👉 Documente explicitamente

---

# ETAPA 2 — DEFINIÇÃO COMPLETA DE TESTES

Crie uma suíte COMPLETA cobrindo:

---

## 🧠 DOMAIN

* criação da entidade AuditLog
* validação de campos obrigatórios
* validação de timestamp
* geração de `anonymous_id`
* regras de severidade baseadas em status HTTP:

  * 2xx → INFO
  * 4xx → WARN
  * 5xx → ERROR
* rejeição de dados inválidos
* normalização de campos

---

## 🧰 UTILS

* sanitização de dados sensíveis (deep sanitize)
* mascaramento de:

  * password
  * token
  * authorization headers
* hash de anonymous_id
* extração de IP:

  * headers (x-forwarded-for)
  * fallback para socket
  * fallback "UNKNOWN"
* truncamento de payloads grandes

---

## ⚙️ APPLICATION (USE CASE)

### SaveAuditLogUseCase

* adiciona log ao buffer (NÃO salva direto)
* não bloqueia execução
* não lança erro para camada superior

### Buffer

* adiciona logs corretamente
* respeita limite de batch (ex: 500)
* dispara flush quando atinge limite
* mantém ordem de inserção

### BatchWorker

* executa insert em lote
* limpa buffer após flush
* retry em falha
* fallback quando DB falha

---

## 🏗️ INFRASTRUCTURE (PostgreSQL)

* conexão via .env
* criação automática da tabela particionada
* criação automática de partições
* insert em batch
* uso correto de JSONB
* índices aplicados corretamente

---

## 🧱 PARTITION MANAGER

* cria partição do dia atual
* cria partição futura
* remove partições > 90 dias
* não recria partições existentes

---

## 📊 AGGREGATION

### Daily Summary

* calcula corretamente:

  * total_requests
  * avg_duration
  * max_duration
  * errors
  * unauthorized
* gera JSONB de insights

### Monthly Summary

* agrega corretamente dados diários

---

## 🛡️ ANOMALY DETECTION

* detecta:

  * força bruta (401/403 por IP)
  * rate abuse (requests por minuto)
  * pico de erro (5xx)
* salva no JSONB

---

## 🌐 MIDDLEWARE

* captura início da request
* captura fim da request
* calcula duration
* coleta:

  * headers
  * body
  * status_code
* envia para use case (fire-and-forget)

---

## 🔥 RESILIÊNCIA

* falha do banco NÃO quebra API
* fallback para arquivo funciona
* erro no worker não afeta requests
* sistema continua operando sob falha parcial

---

## ⚠️ CONCORRÊNCIA / ALTA CARGA

* múltiplas requests simultâneas
* buffer thread-safe (simulado)
* flush concorrente não duplica dados

---

# ETAPA 3 — FERRAMENTA DE TESTE

Use:

* Vitest (preferencial) ou Jest

Estrutura:

```txt
tests/
  domain/
  application/
  utils/
  infrastructure/
  integration/
  middleware/
  performance/
```

---

# ETAPA 4 — PADRÃO DOS TESTES

Todos os testes devem:

* seguir AAA (Arrange / Act / Assert)
* nomes descritivos
* explicar comportamento esperado
* evitar testes genéricos

---

# ETAPA 5 — EDGE CASES (OBRIGATÓRIO)

Cobrir:

* body vazio
* headers ausentes
* request sem IP
* payload gigante
* JSON inválido
* timeout no banco
* falha no insert batch
* partição inexistente
* tentativa de inserir log fora do range
* falha ao dropar partição
* buffer overflow

---

# ETAPA 6 — VALIDAÇÃO DA SPEC

Após criar os testes:

Liste:

## ❗ Ambiguidades

## ⚠️ Comportamentos não definidos

## 🔧 Problemas de design

## 🚨 Riscos de produção

---

# ETAPA 7 — MELHORIAS NA ESPECIFICAÇÃO

Proponha melhorias como:

* contratos explícitos
* limites claros
* estrutura de dados completa
* decisões de performance
* decisões de fallback

---

# ETAPA 8 — GERAR spec-v4.md (VERSÃO FINAL)

Gerar uma nova especificação COMPLETA e MELHORADA contendo:

## 📦 Estrutura obrigatória

* Modelo da entidade AuditLog
* Schema SQL (com PARTITIONING)
* Estratégia de índices
* Estrutura do buffer
* Fluxo do worker
* Interface dos repositórios
* Interface do use case
* Interface do middleware
* Estratégia de fallback
* Estratégia de agregação
* Estrutura JSONB de insights
* Estratégia de retenção (TTL)
* Detecção de anomalias
* Performance esperada

## 📄 Incluir

* exemplos reais de logs
* exemplos JSON
* SQL completo
* pseudo-código dos fluxos críticos

---

# 📤 RESULTADO FINAL

Retorne EXATAMENTE nesta ordem:

1️⃣ Estrutura da suíte de testes
2️⃣ Código completo dos testes
3️⃣ Lista de ambiguidades encontradas
4️⃣ Melhorias propostas na especificação
5️⃣ Documento final **spec-v4.md**

---

# 🚫 REGRAS IMPORTANTES

* NÃO implementar o sistema
* NÃO pular etapas
* NÃO simplificar testes
* NÃO omitir edge cases
* NÃO responder de forma genérica

---

# 📎 BASE

Use como base a especificação fornecida abaixo:

[COLE AQUI SUA spec-v4 ATUAL]

---

# 🎯 RESULTADO ESPERADO

Uma especificação:

* testável
* explícita
* sem ambiguidades
* pronta para implementação real
* preparada para alta escala

Seja técnico, direto e detalhado.