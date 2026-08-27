"use client";

import { Button } from "@/components/ui/button";

/**
 * Só aparece em MODO DEMONSTRAÇÃO (sem MP_ACCESS_TOKEN).
 *
 * O botão de confirmar sem pagar não acompanha o aviso automaticamente: em
 * produção ele fica fora do ar, senão qualquer visitante levaria a rifa de
 * graça enquanto o token do gateway não estiver cadastrado.
 */
export function AvisoDemonstracao({
  podeSimular,
  simulando,
  aoSimular,
}: {
  podeSimular: boolean;
  simulando: boolean;
  aoSimular: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-lima/50 bg-lima/15 p-4 text-left">
      <p className="text-xs text-foreground">
        Modo demonstração: este Pix não cobra ninguém.{" "}
        {podeSimular
          ? "Use o botão abaixo para ver como fica a tela de confirmação."
          : "A confirmação manual está desligada aqui — configure a conta de pagamento para vender de verdade."}
      </p>
      {podeSimular && (
        <Button
          variant="outline"
          className="w-full"
          onClick={aoSimular}
          disabled={simulando}
        >
          {simulando ? "Confirmando..." : "Simular pagamento aprovado"}
        </Button>
      )}
    </div>
  );
}
