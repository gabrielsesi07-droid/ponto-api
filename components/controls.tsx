"use client";
import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Clock3 } from "lucide-react";
export function Pick({
  label,
  value,
  onChange,
  items,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label} className="action w-full bg-white">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Blank({
  title = "Nenhum registro por aqui",
  description = "Os dados aparecerão depois do primeiro lançamento.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Empty className="min-h-52">
      <EmptyHeader>
        <Clock3 className="mx-auto mb-3 text-slate-300" size={32} />
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action}
    </Empty>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span
      className={
        "badge " +
        (value === "Aprovado"
          ? "approved"
          : value === "Revisado"
            ? "reviewed"
            : "pending")
      }
    >
      {value}
    </span>
  );
}
