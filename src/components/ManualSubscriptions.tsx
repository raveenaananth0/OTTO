import { useState } from "react";
import { Button } from "./Button";
import { Input } from "./Input";
import { OttoConfirm } from "./OttoConfirm";
import type { Bill } from "../helpers/simTypes";
import { useManualSubscriptions } from "../helpers/manualSubscriptions";
const formatMoney = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
import s from "./OttoPage.module.css";
export default function ManualSubscriptions() {
  const store = useManualSubscriptions();
  const [editing, setEditing] = useState<string | null>(null),
    [name, setName] = useState(""),
    [amount, setAmount] = useState(""),
    [day, setDay] = useState("1"),
    [error, setError] = useState(""),
    [removing, setRemoving] = useState<Bill | null>(null);
  function reset() {
    setEditing(null);
    setName("");
    setAmount("");
    setDay("1");
    setError("");
  }
  return (
    <section
      className={s.card + " " + s.spaced}
      aria-label="Manual subscriptions"
    >
      <div className={s.row}>
        <h2>Add a subscription</h2>
        <span className={s.badge}>
          Manual list ·{" "}
          {formatMoney(store.items.reduce((sum, i) => sum + i.amount, 0))}/month
        </span>
      </div>
      <p>
        Missing something? Add it here. These entries are saved in this browser
        and included as planned costs in your budget and simulations. Existing
        bank bills are not counted twice.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            store.upsert({
              id: editing || crypto.randomUUID(),
              payee: name,
              amount: Number(amount),
              dueDay: Number(day),
            });
            reset();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not save subscription.",
            );
          }
        }}
      >
        <div className={s.two}>
          <label>
            Subscription name
            <Input
              aria-label="Subscription name"
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gym membership"
            />
          </label>
          <div className={s.two}>
            <label>
              Monthly cost ($)
              <Input
                aria-label="Monthly subscription cost"
                required
                type="number"
                min="0.01"
                max="10000"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              Billing day
              <Input
                aria-label="Subscription billing day"
                required
                type="number"
                min="1"
                max="30"
                step="1"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </label>
          </div>
        </div>
        <div className={s.actions}>
          <Button type="submit">
            {editing ? "Save subscription" : "Add subscription"}
          </Button>
          {editing && (
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel edit
            </Button>
          )}
        </div>
      </form>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {store.storageNotice && <p role="status">{store.storageNotice}</p>}
      {store.items.map((item) => (
        <div className={s.row + " " + s.spaced} key={item.id}>
          <div>
            <strong>{item.payee}</strong>
            <p>
              Day {item.dueDay} · {formatMoney(item.amount)}/month · Added by
              you
            </p>
          </div>
          <div className={s.actions}>
            <Button
              size="sm"
              variant="outline"
              aria-label={"Edit " + item.payee}
              onClick={() => {
                setEditing(item.id);
                setName(item.payee);
                setAmount(String(item.amount));
                setDay(String(item.dueDay));
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={"Remove " + item.payee}
              onClick={() => setRemoving(item)}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      {removing && (
        <OttoConfirm
          busy={false}
          title="Remove this entry?"
          label="Remove entry"
          onClose={() => setRemoving(null)}
          onConfirm={() => {
            store.remove(removing.id);
            if (editing === removing.id) reset();
            setRemoving(null);
          }}
        >
          <p>
            Remove {removing.payee} from your manual list? This does not cancel
            the subscription with the merchant.
          </p>
        </OttoConfirm>
      )}
    </section>
  );
}
