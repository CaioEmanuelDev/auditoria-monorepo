# Análise de Ambiguidades Encontradas na Especificação V1

## 🚨 Ambiguidades Críticas

### 1. **Schema da Tabela `audit_logs` Não Definido**
**Problema**: A especificação menciona criar tabela automaticamente, mas não define estrutura.

**Impacto**: Testes precisam assumir estrutura de campos.

**Solução na V2**: Definir SQL exato da tabela.

---

### 2. **Captura de User ID Não Especificada**
**Problema**: Especificação menciona "Usuário" a capturar, mas não define:
- Como extraí-lo (session? JWT? header customizado?)
- Se é obrigatório ou opcional
- Se pode ser null

**Impacto**: Middleware não sabe onde buscar userId.

**Solução na V2**: Definir estratégia de extração (exemplo: header `X-User-ID`).

---

### 3. **Timestamp — Automático ou Passado?**
**Problema**: Não fica claro se:
- Timestamp é gerado no middleware
- Timestamp é passado no body
- Timezone é considerado

**Impacto**: Histórico de requisições pode ter tempos imprecisos.

**Solução na V2**: Definir que timestamp é **gerado automaticamente no servidor** (sempre servidor como fonte confiável).

---

### 4. **Headers HTTP — Quais são Capturados?**
**Problema**: Especificação menciona "Headers" mas não define:
- Quais headers capturar (todos? apenas alguns?)
- Headers sensíveis (Authorization deve ser capturado/mascarado?)
- Limite de tamanho

**Impacto**: Insegurança (tokens podem ser capturados) ou falta de contexto.

**Solução na V2**: Definir lista específica de headers capturados + lista de headers a ignorar.

---

### 5. **Body — Como é Capturado?**
**Problema**: Não especifica:
- Se é capturado como string ou parseado
- Limite de tamanho
- Como lidar com arquivo binário (multipart)
- Se body muito grande trunca

**Impacto**: Testes precisam assumir objeto JSON parseado.

**Solução na V2**: Definir formato único (toString() se raw, JSON se aplicável).

---

### 6. **Sanitização — Quando Acontece?**
**Problema**: Não especifica:
- Antes ou depois de validar
- Antes ou depois de salvar
- Se muta objeto original ou cria cópia

**Impacto**: Dados no banco podem estar parcialmente sanitizados.

**Solução na V2**: Sanitizar **após validação, antes de persistir**, sempre cria **cópia** (imutável).

---

### 7. **Interface do Repositório Não Definida**
**Problema**: Qual é a interface de chamada?
```js
// Opção A:
await repository.save(auditLog)

// Opção B:
await repository.insert('audit_logs', auditLog)

// Opção C:
await repository.execute('INSERT INTO ...')
```

**Impacto**: Use case não sabe como chamar repositório.

**Solução na V2**: Definir interface exata (Opção A é mais clean).

---

### 8. **Tratamento de Erro no Fallback**
**Problema**: Se arquivo fallback falhar ao escrever:
- Log é perdido?
- Erro é silencioso ou logado?
- Requisição é bloqueada?

**Impacto**: Auditoria crítica pode desaparecer.

**Solução na V2**: Definir que **erro em fallback é registrado no console/stdout** (não arquivo), **nunca bloqueia requisição**.

---

### 9. **Formato do Arquivo Fallback**
**Problema**: Como os logs são armazenados em `logs/audit-fallback.json`?
- JSON Array acumulativo?
- JSON Lines (um por linha)?
- JSON Stream?

**Impacto**: Parsing do arquivo é ambíguo.

**Solução na V2**: Usar **JSON Lines format** (uma entrada JSON por linha), uma por requisição.

---

### 10. **Middleware Assíncrono — Fire and Forget Como?**
**Problema**: Como garantir que use case roda assincronamente?
```js
// Opção A: Não aguardar
middleware(req, res, next) {
  useCase.execute(data); // Sem await
  next();
}

// Opção B: Promise sem await
middleware(req, res, next) {
  useCase.execute(data).catch(...); // Promise sem await
  next();
}

// Opção C: setImmediate
middleware(req, res, next) {
  setImmediate(() => useCase.execute(data));
  next();
}
```

**Impacto**: Se uso errado, pode bloquear ou perder erro.

**Solução na V2**: Usar **Promise sem await** com `.catch()` para logar erro.

---

### 11. **Singleton Logger Do Banco — Como Instanciar?**
**Problema**: Especificação diz "Singleton", mas não define:
- Quando é criado (na inicialização? À primeira requisição?)
- Se pode ser reinicializado
- Como trata múltiplas instâncias (monorepo)

**Impacto**: Possível vazamento de memória ou estado compartilhado indesejado.

**Solução na V2**: Criar singleton **durante `await Audit.initialize()`**, reutilizar para todas requisições.

---

### 12. **Mascaramento — Apenas Top-Level ou Nested?**
**Problema**: Especificação diz "remover dados sensíveis", mas:
```js
// Qual é sanitizado?
{
  password: 'secret', // ✓ Top-level
  user: {
    password: 'secret', // ✓ Nested?
  },
  credentials: {
    data: {
      apiKey: 'sk_123', // ✓ Muito nested?
    },
  },
}
```

**Impacto**: Dados sensíveis podem vazar em estruturas aninhadas.

**Solução na V2**: Sanitizar **recursivamente em profundidade ilimitada**.

---

### 13. **Campos Sensíveis — Lista Completa?**
**Problema**: Especificação menciona:
> password, token, secret, apiKey

Mas e:
- `pwd` (variação)?
- `api_key` (snake_case)?
- `Bearer` em headers?
- `sessionId`?
- `refreshToken`?

**Impacto**: Campos sensíveis podem não ser mascarados.

**Solução na V2**: Definir **lista completa padrão + permitir customização**.

---

### 14. **Contexto de Usuário — Como Passar?**
**Problema**: Se não há userId no header, como saber quem fez a requisição?

**Impacto**: Testes assumem userId opcional, mas é crítico para auditoria.

**Solução na V2**: Define que userId pode vir de:
1. Header `X-User-ID`
2. Contexto Express/Fastify (context locals)
3. JWT (decodificado)

---

### 15. **Erro em Criação de Tabela — Comportamento?**
**Problema**: Se tabela não pode ser criada (permissão negada):
- Application está bloqueada?
- Usa fallback imediatamente?
- Tenta novamente?

**Impacto**: Modo fallback é acionado por erro ou por timeout.

**Solução na V2**: **Falha em criar tabela = ativa fallback, sem retry automático**.

---

### 16. **Tamanho Máximo do Log?**
**Problema**: Não há limite de tamanho mencionado:
- Body muito grande (MB) afeta performance?
- Log é truncado?

**Impacto**: Banco pode ficar saturado.

**Solução na V2**: Definir limite (exemplo: **body máximo 64KB, URL máxima 2KB**).

---

### 17. **Encoding de Dados?**
**Problema**: Se body é binary (imagem, zip), como é capturado?

**Impacto**: Logs podem estar corrompidos.

**Solução na V2**: **Ignorar body para content-type não textual** (binary, image, etc).

---

### 18. **Sincronização entre Logger Winston e Banco**
**Problema**: Winston é configurado **uma única vez**, mas:
- Onde fica configurado (qual arquivo)?
- Como sabe caminho de `logs/`?
- Usa mesmo logger para console + file?

**Impacto**: Integração Winston/Banco ambígua.

**Solução na V2**: Definir que **Winston é inicializado pela classe `DatabaseConnection`** durante `initialize()`.

---

## 📊 Sumário de Ambiguidades

| Tipo | Total | Severidade |
|------|-------|-----------|
| Estrutura de Dados | 5 | 🔴 Crítica |
| Comportamento | 7 | 🔴 Crítica |
| Integração | 4 | 🟠 Alta |
| Edge Cases | 2 | 🟡 Média |

**Total: 18 ambiguidades identificadas**

---

## ✅ Melhorias Propostas para V2

1. **Definir schema SQL completo** da tabela `audit_logs`
2. **Especificar headers capturados** (whitelist/blacklist)
3. **Definir estratégia de userId** (onde vem)
4. **Descrever formato body** capturado
5. **Certificar sanitização recursiva**
6. **Definir lista padrão de campos sensíveis**
7. **Descrever interface de repositório**
8. **Especificar formato JSON Lines** do fallback
9. **Definir tratamento de erro em fallback**
10. **Descrever sequência fire-and-forget**
11. **Detalhar inicialização de Singleton**
12. **Definir limites de tamanho** (body, URL)
13. **Detalhar ignored content-types** (binary)
14. **Especificar timeout** do banco
15. **Definir retenção de logs** (dias?)
16. **Especificar tratamento race condition** (create table simultânea)
17. **Descrever como passa logger entre camadas**
18. **Definir versionamento de schema**
