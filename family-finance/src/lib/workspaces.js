import { WORKSPACE_TYPES, CURRENCIES } from '../constants/workspaces';
import { calcTotalSpent, calcTotalReceived } from './finance';

/** Get workspace type config by id */
export const getWorkspaceType = (typeId) =>
  WORKSPACE_TYPES.find(t => t.id === typeId) || WORKSPACE_TYPES[0];

/** Get currency config by code */
export const getCurrency = (code) =>
  CURRENCIES.find(c => c.code === code) || CURRENCIES[0];

/** Format an amount using a workspace's currency */
export const fmtCurrency = (amount, currencyCode) => {
  const cur = getCurrency(currencyCode);
  return cur.symbol + ' ' + Math.round(amount || 0).toLocaleString('en-GH');
};

/** Build a quick snapshot of a workspace for the panel */
export const buildWorkspaceSnapshot = (workspace) => {
  const spent    = calcTotalSpent(workspace.txs || []);
  const received = calcTotalReceived(workspace.incomes || []);
  const budget   = workspace.monthlyBudget || 0;
  const healthPct = budget > 0
    ? Math.max(0, Math.min(100, Math.round(((budget - spent) / budget) * 100)))
    : 0;

  return { spent, received, budget, healthPct };
};

/** Create a new blank workspace object */
export const createWorkspace = ({ name, typeId, currency, monthlyBudget }) => ({
  id:            'ws_' + Date.now(),
  name:          name.trim(),
  typeId,
  currency:      currency || 'GHS',
  monthlyBudget: parseFloat(monthlyBudget) || 0,
  txs:           [],
  incomes:       [],
  createdAt:     new Date().toISOString(),
});
