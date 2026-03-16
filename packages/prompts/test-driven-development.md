Você é um engenheiro de software sênior especializado em Node.js, Clean Architecture, testes automatizados e design de bibliotecas.

Vou fornecer uma especificação técnica de um pacote Node.js.

Sua tarefa NÃO é implementar o pacote ainda.

Primeiro você deve usar TDD (Test Driven Development) para tornar a especificação mais precisa.

PROCESSO OBRIGATÓRIO:

ETAPA 1 — ANÁLISE DA ESPECIFICAÇÃO

Leia cuidadosamente a especificação fornecida.

Identifique:

- comportamentos implícitos
- regras de negócio
- fluxos obrigatórios
- casos de erro
- dependências externas
- limites de responsabilidade entre camadas

Se algo estiver ambíguo, assuma o comportamento mais seguro e documente.

---

ETAPA 2 — DEFINIÇÃO DE TESTES

Crie uma suíte completa de testes unitários e de integração que descrevam o comportamento esperado do sistema.

Os testes devem cobrir:

DOMÍNIO

- criação da entidade AuditLog
- validação de campos obrigatórios
- regras de severidade baseadas em status HTTP
- anonimização de IP
- rejeição de dados inválidos

UTILITÁRIOS

- sanitização de dados sensíveis
- mascaramento de password
- mascaramento de tokens
- extração de IP
- fallback para UNKNOWN

USE CASE

- SaveAuditLogUseCase salva logs corretamente
- SaveAuditLogUseCase chama repositório correto
- comportamento quando repositório falha

INFRASTRUCTURE

- criação automática da tabela audit_logs
- conexão com banco usando .env
- fallback para arquivo quando banco falha

MIDDLEWARE

- captura início da requisição
- captura final da requisição
- coleta de dados HTTP
- envio para use case

RESILIÊNCIA

- falha do banco não quebra a API
- fallback é acionado corretamente
- logs continuam sendo gerados

---

ETAPA 3 — FERRAMENTA DE TESTE

Use:

- Jest ou Vitest

Formato esperado:

tests/
domain/
application/
utils/
integration/
middleware/

Os testes devem ser escritos em JavaScript.

---

ETAPA 4 — TESTES COMO DOCUMENTAÇÃO

Cada teste deve:

- explicar claramente o comportamento esperado
- ter nomes descritivos
- seguir padrão AAA

Arrange
Act
Assert

---

ETAPA 5 — COBERTURA DE EDGE CASES

Inclua testes para:

- body vazio
- headers ausentes
- request sem IP
- erro de timeout no banco
- erro de escrita em arquivo
- dados sensíveis aninhados

---

ETAPA 6 — VALIDAÇÃO DA ESPECIFICAÇÃO

Após gerar os testes, analise:

- se a especificação original é suficiente para passar nos testes
- quais partes estão ambíguas
- quais comportamentos precisam ser definidos explicitamente

Liste todas as melhorias necessárias na especificação.

---

ETAPA 7 — GERAR SPEC V2

Com base nos testes criados, gere uma nova versão da especificação:

# spec-v2.md

A nova especificação deve:

- eliminar ambiguidades
- incluir contratos explícitos
- definir estrutura de dados completa
- definir schema da tabela audit_logs
- definir interface dos repositórios
- definir estrutura do payload de log
- definir comportamento do middleware
- definir estratégia de fallback

Inclua:

- modelo de dados do AuditLog
- formato JSON do log
- SQL da tabela audit_logs
- interface do repository
- interface do logger
- exemplos de logs reais

---

ETAPA 8 — RESULTADO FINAL

Retorne nesta ordem:

1️⃣ Estrutura da suíte de testes  
2️⃣ Código completo dos testes  
3️⃣ Lista de ambiguidades encontradas  
4️⃣ Melhorias propostas na especificação  
5️⃣ Novo documento **spec-v2.md**

NÃO implemente o pacote ainda.

A implementação só deve acontecer após a aprovação da spec-v2.