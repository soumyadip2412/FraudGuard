import { Fragment, useState } from "react";
import { DecisionTag } from "../components/DecisionTag";
import { Notice } from "../components/Notice";
import { Verdict } from "../components/Verdict";
import { type LogFilter, useTransactions } from "../hooks/useTransactions";
import { formatAmount, formatCount, formatDateTime, formatPercent, modelName } from "../lib/format";
import type { StoredTransaction, TransactionPage } from "../types";

const PAGE_SIZE = 25;
const FILTERS: { id: LogFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "flagged", label: "Flagged" },
  { id: "cleared", label: "Cleared" },
];

export function LogView() {
  const [filter, setFilter] = useState<LogFilter>("all");
  const [offset, setOffset] = useState(0);
  const { page, error, loading, reload } = useTransactions(filter, offset, PAGE_SIZE);

  function changeFilter(next: LogFilter) {
    setFilter(next);
    setOffset(0);
  }

  return (
    <div className="narrow-wide">
      <div className="view-header">
        <h1 className="view-title">Transaction log</h1>
        <button type="button" className="btn btn-quiet" onClick={reload} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p className="view-lede">Every transaction checked with Check and record, newest first, with the decision made at the time.</p>
      <FilterBar value={filter} onChange={changeFilter} />
      {error && <Notice tone="error">{error}</Notice>}
      {page && <LogTable page={page} filter={filter} />}
      {page && <Pager total={page.total} offset={offset} onChange={setOffset} />}
    </div>
  );
}

function FilterBar({ value, onChange }: { value: LogFilter; onChange: (filter: LogFilter) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Show">
      {FILTERS.map(({ id, label }) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function LogTable({ page, filter }: { page: TransactionPage; filter: LogFilter }) {
  const [openId, setOpenId] = useState<number | null>(null);
  if (page.items.length === 0) return <EmptyLog filter={filter} />;

  return (
    <div className="table-scroll">
      <table className="ledger">
        <thead>
          <tr>
            <th scope="col">Transaction</th>
            <th scope="col" className="wide-only">Recorded</th>
            <th scope="col" className="num">Amount</th>
            <th scope="col" className="num">Fraud chance</th>
            <th scope="col">Decision</th>
          </tr>
        </thead>
        <tbody>
          {page.items.map((txn) => (
            <LogRow key={txn.id} txn={txn} open={openId === txn.id} onToggle={() => setOpenId(openId === txn.id ? null : txn.id)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogRow({ txn, open, onToggle }: { txn: StoredTransaction; open: boolean; onToggle: () => void }) {
  return (
    <Fragment>
      <tr className={open ? "is-open" : undefined}>
        <td>
          <button type="button" className="row-toggle" aria-expanded={open} onClick={onToggle}>
            {txn.id}
          </button>
        </td>
        <td className="wide-only">{formatDateTime(txn.created_at)}</td>
        <td className="num">{formatAmount(txn.amount)}</td>
        <td className="num">{formatPercent(txn.fraud_probability)}</td>
        <td><DecisionTag flagged={txn.is_fraud} /></td>
      </tr>
      {open && (
        <tr className="row-detail">
          <td colSpan={5}>
            <Verdict prediction={txn} headingLevel="h3">
              <p className="hint">
                Recorded {formatDateTime(txn.created_at)}. Scored by {modelName(txn.model)} with a flagging threshold of{" "}
                {formatPercent(txn.threshold)}.
              </p>
            </Verdict>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function EmptyLog({ filter }: { filter: LogFilter }) {
  const what = filter === "all" ? "No transactions recorded yet." : `No ${filter} transactions.`;
  return (
    <div className="empty">
      <p className="body-copy">{what} Use Check and record on the Check page to add one.</p>
      <a className="btn btn-secondary" href="#check">
        Check a transaction
      </a>
    </div>
  );
}

function Pager({ total, offset, onChange }: { total: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= PAGE_SIZE) return null;
  const last = Math.min(offset + PAGE_SIZE, total);
  return (
    <div className="pager">
      <span className="hint">
        {formatCount(offset + 1)} to {formatCount(last)} of {formatCount(total)}
      </span>
      <button type="button" className="btn btn-quiet" disabled={offset === 0} onClick={() => onChange(offset - PAGE_SIZE)}>
        Newer
      </button>
      <button type="button" className="btn btn-quiet" disabled={last >= total} onClick={() => onChange(offset + PAGE_SIZE)}>
        Older
      </button>
    </div>
  );
}
