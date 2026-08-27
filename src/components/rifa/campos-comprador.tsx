"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarCpf, formatarTelefone } from "@/lib/validacao";

/** Dados do comprador. Os erros vêm prontos do formulário que orquestra tudo. */
export interface DadosComprador {
  nome: string;
  whatsapp: string;
  cpf: string;
}

export type ErrosComprador = Partial<Record<keyof DadosComprador, string>>;

export function CamposComprador({
  dados,
  erros,
  aoMudar,
}: {
  dados: DadosComprador;
  erros: ErrosComprador;
  aoMudar: (campo: keyof DadosComprador, valor: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome completo</Label>
        <Input
          id="nome"
          name="name"
          autoComplete="name"
          placeholder="Como no documento"
          value={dados.nome}
          onChange={(e) => aoMudar("nome", e.target.value)}
          aria-invalid={Boolean(erros.nome)}
        />
        {erros.nome && (
          <p className="text-sm font-medium text-destructive">{erros.nome}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="whatsapp">WhatsApp</Label>
          <Input
            id="whatsapp"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(15) 99999-9999"
            value={dados.whatsapp}
            onChange={(e) => aoMudar("whatsapp", formatarTelefone(e.target.value))}
            aria-invalid={Boolean(erros.whatsapp)}
          />
          {erros.whatsapp && (
            <p className="text-sm font-medium text-destructive">
              {erros.whatsapp}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cpf">CPF</Label>
          <Input
            id="cpf"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={dados.cpf}
            onChange={(e) => aoMudar("cpf", formatarCpf(e.target.value))}
            aria-invalid={Boolean(erros.cpf)}
          />
          {erros.cpf && (
            <p className="text-sm font-medium text-destructive">{erros.cpf}</p>
          )}
        </div>
      </div>
    </div>
  );
}
