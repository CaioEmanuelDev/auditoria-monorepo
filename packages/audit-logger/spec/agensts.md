
---

# Especificação Técnica — Audit Logger Package

## 1. Visão Geral

Este pacote é um **middleware de auditoria plug-and-play** desenvolvido em **Node.js (v20+)**.

Seu objetivo principal é **registrar automaticamente o rastro de auditoria (Audit Trail)** de todas as interações e eventos sistêmicos de uma aplicação.

O pacote captura **metadados críticos** e os persiste **de forma assíncrona em um banco de dados relacional**.

Um diferencial chave é a capacidade de **auto-configuração**: caso a tabela de logs não exista, o pacote tentará **criá-la automaticamente** utilizando as credenciais de um arquivo `.env` localizado na **raiz do projeto**.

---

# 2. Princípios Arquiteturais

*(Clean Architecture & Clean Code)*

A biblioteca é construída isolando a lógica de negócios das ferramentas externas para garantir **testabilidade**, **manutenção** e **baixo acoplamento**.

## Domain Layer (Entidades)

Define a estrutura pura do **AuditLog**.

Esta camada **não conhece**:

* banco de dados
* frameworks HTTP
* bibliotecas de log (ex: Winston)

Responsável apenas pelas **regras de negócio do domínio**.

---

## Application Layer (Use Cases)

Contém a **regra de orquestração da aplicação**.

Exemplo:

* `SaveAuditLogUseCase`

Responsabilidades:

* Receber dados da requisição
* Validar através do Domínio
* Coordenar envio para repositórios

---

## Interface Adapters (Middlewares / Controllers)

Adaptadores responsáveis por extrair dados de frameworks HTTP como:

* Express
* Fastify

Dados capturados:

* IP
* Headers
* Body
* URL
* Método
* Status Code

Esses dados são convertidos para o **formato aceito pelo Use Case**.

---

## Infrastructure Layer

Camada externa responsável pela interação com recursos do sistema.

Responsabilidades:

* Conexão com banco de dados (SQL)
* Leitura do `.env`
* Configuração do **Winston**
* Persistência de logs

---

# 3. Estratégia DRY (Don't Repeat Yourself)

## Instância Singleton do Logger

A conexão com o banco e a configuração do **Winston** são **instanciadas apenas uma vez**, no momento do **bootstrap do pacote**.

---

## Sanitização Centralizada

Existe **uma única lógica centralizada** para remover ou mascarar dados sensíveis do payload antes de salvar.

Exemplos de campos sensíveis:

* password
* token
* secret
* apiKey

Isso evita duplicação de lógica em diferentes partes do sistema.

---

## Fábrica de Middlewares

O pacote exporta **funções prontas para uso**, eliminando a necessidade do desenvolvedor configurar interceptadores manualmente.

Exemplo:

```javascript
app.use(Audit.expressMiddleware())
```

---

# 4. Tratamento de Falhas e Comportamento Resiliente

## Regra Absoluta (Fail-Safe)

Uma falha na auditoria **nunca deve interromper o fluxo da aplicação principal**.

O processo funciona no modelo:

```
fire and forget
```

---

## Fallback Storage

Se o banco de dados falhar (timeout, queda ou erro de conexão):

* O pacote captura o erro internamente
* O log é redirecionado para um arquivo local:

```
logs/audit-fallback.json
```

Utilizando **Winston**.

---

## Resiliência na Inicialização

Caso o banco esteja inacessível no momento do **startup**:

* O pacote emite um **aviso**
* Opera automaticamente em **modo fallback (arquivo)**

Esse modo permanece ativo até que a aplicação seja reiniciada.

---

# 5. Estrutura de Diretórios

```
packages/audit-logger/

src/
├── adapters/
│   ├── http/                 # Adaptadores HTTP genéricos
│   └── middlewares/          # Middlewares específicos (Express, Fastify)
│
├── application/
│   ├── ports/                # Interfaces / contratos
│   └── useCases/             # Casos de uso (SaveLogUseCase)
│
├── domain/
│   ├── entities/             # AuditLogEntity
│   └── exceptions/           # Erros customizados
│
├── infrastructure/
│   ├── database/             # Conexão e auto-migrate SQL
│   └── logger/               # Winston (Console + File)
│
├── utils/                    # Utilitários (Masker, IP extractor)
│
└── index.js                  # Facade pública do pacote
```

---

# 6. Regras Gerais

### Agnosticismo de Banco

O código deve permitir uso de múltiplos drivers SQL:

* PostgreSQL
* MySQL
* outros drivers compatíveis

---

### JavaScript com Boas Práticas

Mesmo sendo JavaScript puro, o código deve seguir boas práticas:

* uso consistente de **JSDoc para tipagem**
* validações explícitas
* separação clara de camadas
* baixo acoplamento entre módulos

---

### Dependências Enxutas

Minimizar dependências externas para manter a biblioteca:

* leve
* rápida
* fácil de manter

---

# 7. Fluxo Obrigatório

O fluxo de auditoria deve seguir as seguintes etapas.

### 1 — Interceptação

Captura:

* início da requisição
* final da requisição

---

### 2 — Extração

Coleta dos dados:

* IP
* Usuário
* URL
* Método
* Body
* Status Code

---

### 3 — Sanitização

Campos sensíveis são mascarados.

Exemplo:

```
password → ********
```

---

### 4 — Delegação

Os dados são enviados para:

```
SaveAuditLogUseCase
```

---

### 5 — Persistência

Fluxo:

```
Tenta salvar no banco
        ↓
Se falhar
        ↓
Ativa fallback em arquivo
```

---

# 8. Testes

## Testes de Unidade

Devem validar:

* lógica de sanitização
* regras do domínio
* validações de entidade

Utilizando **mocks para o banco de dados**.

---

## Testes de Integração

Devem validar:

* criação automática da tabela
* comportamento de fallback
* persistência real no banco

---

## Ferramentas

* **Vitest**
* **Jest**

---

## Cobertura

Cobertura mínima exigida:

```
80%
```

---

# 9. Restrições

* Requer **Node.js >= 20**
* **Proibido** uso de `console.log` para mensagens internas
* Utilizar sempre o **logger do pacote**
* Configurações de banco devem ser lidas **dinamicamente do `.env` da raiz**
* Utilizar yarn

---

# 10. Requisitos

O projeto host deve:

* fornecer credenciais válidas no `.env`
* executar a inicialização do pacote antes do servidor subir

Exemplo:

```javascript
await Audit.initialize()
```

---

# 11. Regras de Negócio

## Severidade

Classificação automática baseada no **status HTTP**.

| Status Code | Severidade |
| ----------- | ---------- |
| 100–399     | INFO       |
| 400–499     | WARN       |
| 500+        | ERROR      |

---

## Anonimização

Se o IP não puder ser detectado:

```
IP = "UNKNOWN"
```

---

# 12. Critérios de Aceitação

O pacote será considerado funcional se:

* A tabela **audit_logs** for criada automaticamente caso não exista.
* Cada requisição gerar uma **entrada correspondente no banco**.
* A queda do banco **não gerar erro 500 na API**.
* Os logs sejam redirecionados para **arquivo em caso de falha**.
* **Dados sensíveis nunca apareçam em texto claro**.

---