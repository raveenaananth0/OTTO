import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "./Button";
import { Input } from "./Input";
import { Textarea } from "./Textarea";
import {
  habitItems,
  frequencyLabel,
  habitsFromItems,
  type Habits,
  type Habit,
} from "../helpers/projectFuture";
import s from "./HabitEditor.module.css";
export function HabitEditor({
  value,
  paychecks,
  onChange,
}: {
  value: Habits;
  paychecks: number;
  onChange: (value: Habits) => void;
}) {
  const items = habitItems(value);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newFrequency, setNewFrequency] = useState<Habit["frequency"]>("month");
  const [newKind, setNewKind] = useState<Habit["kind"]>("expense");
  function update(id: string, change: Partial<Habit>) {
    setError("");
    onChange(
      habitsFromItems(
        items.map((item) => (item.id === id ? { ...item, ...change } : item)),
        paychecks,
        value.statement,
        value.targetYear,
      ),
    );
  }
  return (
    <div className={s.editor}>
      {error && <p role="alert">{error}</p>}
      <p className={s.help}>
        Spending less leaves more money for your future. Adding a spending habit
        adds a new cost.
      </p>
      <details>
        <summary className={s.help}>Personal goal (optional)</summary>
        <label className={s.statement}>
          My intention
          <Textarea
            value={value.statement || ""}
            maxLength={240}
            placeholder="I want to cook at home and save for travel."
            onChange={(e) => onChange({ ...value, statement: e.target.value })}
          />
        </label>
      </details>
      <div className={s.items}>
        {items.map((item) => (
          <div className={s.item} key={item.id}>
            <div className={s.top}>
              <label className={s.name}>
                <span>Habit name</span>
                <Input
                  aria-label={"Name for " + item.label}
                  value={item.label}
                  maxLength={60}
                  onChange={(e) => update(item.id, { label: e.target.value })}
                />
              </label>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={"Remove " + item.label}
                onClick={() =>
                  onChange(
                    habitsFromItems(
                      items.filter((h) => h.id !== item.id),
                      paychecks,
                      value.statement,
                      value.targetYear,
                    ),
                  )
                }
              >
                <Trash2 size={14} />
              </Button>
            </div>
            <div className={s.amount}>
              <label>
                <span>Amount ($)</span>
                <Input
                  aria-label={"Amount for " + item.label}
                  type="number"
                  min={0}
                  max={10000}
                  step="0.01"
                  value={item.amount}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 0 && n <= 10000)
                      update(item.id, { amount: Math.round(n * 100) / 100 });
                    else
                      setError(
                        "Use an amount from $0 to $10,000. The graph keeps your last valid amount.",
                      );
                  }}
                />
              </label>
              <label>
                <span>Frequency</span>
                <select
                  aria-label={"Frequency for " + item.label}
                  value={item.frequency}
                  onChange={(e) =>
                    update(item.id, {
                      frequency: e.target.value as Habit["frequency"],
                    })
                  }
                >
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                  <option value="payday">Each payday</option>
                </select>
              </label>
            </div>
            <details className={s.options}>
              <summary>
                {item.kind === "expense"
                  ? "Spending"
                  : item.kind === "saving"
                    ? "Saving"
                    : "Investing"}{" "}
                · {frequencyLabel(item.frequency)} · Edit options
              </summary>
              <label className={s.kind}>
                <span>This money is for</span>
                <select
                  aria-label={"Type for " + item.label}
                  value={item.kind}
                  onChange={(e) =>
                    update(item.id, { kind: e.target.value as Habit["kind"] })
                  }
                >
                  <option value="expense">Spending</option>
                  <option value="saving">Saving</option>
                  <option value="investment">Investing</option>
                </select>
              </label>
            </details>
          </div>
        ))}
      </div>
      {adding ? (
        <form
          className={s.item}
          aria-label="Add a habit"
          onSubmit={(event) => {
            event.preventDefault();
            const amount = Number(newAmount);
            if (
              !newName.trim() ||
              !Number.isFinite(amount) ||
              amount <= 0 ||
              amount > 10000
            ) {
              setError(
                "Enter a habit name and an amount from $0.01 to $10,000.",
              );
              return;
            }
            setError("");
            onChange(
              habitsFromItems(
                [
                  ...items,
                  {
                    id: crypto.randomUUID(),
                    label: newName.trim(),
                    kind: newKind,
                    frequency: newFrequency,
                    amount: Math.round(amount * 100) / 100,
                  },
                ],
                paychecks,
                value.statement,
                value.targetYear,
              ),
            );
            setAdding(false);
            setNewName("");
            setNewAmount("");
            setNewFrequency("month");
          }}
        >
          <label>
            Habit name
            <Input
              autoFocus
              required
              maxLength={60}
              value={newName}
              placeholder="e.g. Gym or dining out"
              onChange={(e) => setNewName(e.target.value)}
            />
          </label>
          <label>
            Amount ($)
            <Input
              required
              type="number"
              min="0.01"
              max="10000"
              step="0.01"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
            />
          </label>
          <label>
            Frequency
            <select
              aria-label="New habit frequency"
              value={newFrequency}
              onChange={(e) =>
                setNewFrequency(e.target.value as Habit["frequency"])
              }
            >
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
              <option value="payday">Each payday</option>
            </select>
          </label>
          <label>
            This money is for
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as Habit["kind"])}
            >
              <option value="expense">Spending</option>
              <option value="saving">Saving</option>
              <option value="investment">Investing</option>
            </select>
          </label>
          <p className={s.help}>
            {newKind === "expense"
              ? "This adds a cost at the frequency you choose. To cut an existing cost, edit that habit above."
              : newKind === "saving"
                ? "This moves existing cash to savings. Moving it does not create new money; interest affects growth."
                : "This invests available cash using the assumed return. Growth is illustrative and can be negative in real life."}
          </p>
          <Button type="submit">Add to my plan</Button>{" "}
          <Button variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={items.length >= 20}
          onClick={() => setAdding(true)}
        >
          <Plus size={14} /> Add habit
        </Button>
      )}
      <p className={s.help}>
        Saving moves your existing money, so the immediate total stays the same.
        Interest and investment assumptions change its long-term growth.
      </p>
    </div>
  );
}
