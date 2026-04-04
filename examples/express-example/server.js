const express = require('express');
const { Audit } = require('@internal/audit-logger');// <-- Importa como lib!

const app = express();

async function main() {
    await Audit.init({ database: process.env.DATABASE_URL});
    app.use(Audit.expressMiddleware());
    app.listen(3000);
}

main();