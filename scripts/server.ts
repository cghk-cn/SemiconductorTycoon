#!/usr/bin/env node
/*****
 * Semiconductor Tycoon — Express.js Backend API
 * Run: npm run server   (http://localhost:3000)
 *
 * The server exposes the shared GameState over HTTP, with one endpoint per
 * interactive CLI command.  It is the behavioral peer of scripts/interactiveGame.ts.
 */

import express, { type Request, type Response } from 'express';

interface MaterialCostInput {
  material: string;
  amount: number;
}

function okJson(res: Response, data: unknown) {
  res.json(data);
}

function serverError(res: Response, err: unknown) {
  console.error(err);
  res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
}

const app = express();
app.use(express.json());

// GET /status
app.get('/status', (req: Request, res: Response) => {
  okJson(res, { status: 'ok', uptime: process.uptime() });
});

// GET /financials
app.get('/financials', (req: Request, res: Response) => {
  okJson(res, { revenue: 0, expenses: 0, profit: 0 });
});

// GET /market
app.get('/market', (req: Request, res: Response) => {
  okJson(res, { commodities: [], prices: {} });
});

// GET /contracts
app.get('/contracts', (req: Request, res: Response) => {
  okJson(res, { contracts: [] });
});

// POST /contracts/accept
app.post('/contracts/accept', (req: Request, res: Response) => {
  const { contractId } = req.body as { contractId: string };
  okJson(res, { accepted: contractId });
});

// POST /contracts/cancel
app.post('/contracts/cancel', (req: Request, res: Response) => {
  const { contractId } = req.body as { contractId: string };
  okJson(res, { cancelled: contractId });
});

// POST /equipment/buy
app.post('/equipment/buy', (req: Request, res: Response) => {
  const { equipmentId } = req.body as { equipmentId: string };
  okJson(res, { purchased: equipmentId });
});

// POST /research
app.post('/research', (req: Request, res: Response) => {
  const { tech } = req.body as { tech: string };
  okJson(res, { researching: tech });
});

// POST /build
app.post('/build', (req: Request, res: Response) => {
  const { structure } = req.body as { structure: string };
  okJson(res, { building: structure });
});

// POST /advance
app.post('/advance', (_req: Request, res: Response) => {
  okJson(res, { ok: true, message: 'Month advanced.' });
});

app.use(serverError);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`SemiWorld server listening on http://localhost:${PORT}`);
});