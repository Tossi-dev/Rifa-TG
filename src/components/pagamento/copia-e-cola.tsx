"use client";

import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Campo do Pix copia e cola com botão de copiar. */
export function CopiaECola({
  codigo,
  copiado,
  aoCopiar,
}: {
  codigo: string;
  copiado: boolean;
  aoCopiar: () => void;
}) {
  return (
    <div className="text-left">
      <Label className="mb-2">Ou use o Pix copia e cola</Label>
      <div className="flex gap-2">
        <Input
          id="brcode"
          readOnly
          value={codigo}
          onFocus={(e) => e.target.select()}
          className="font-mono text-xs"
        />
        <Button
          type="button"
          variant={copiado ? "zap" : "default"}
          onClick={aoCopiar}
        >
          <Copy /> {copiado ? "Copiado!" : "Copiar"}
        </Button>
      </div>
    </div>
  );
}
