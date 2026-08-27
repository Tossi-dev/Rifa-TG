"use client";

import { ArrowRight, QrCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RIFA, brl } from "@/lib/config";
import { CamposComprador } from "./campos-comprador";
import { SeletorCotas } from "./seletor-cotas";
import { SeletorVendedor } from "./seletor-vendedor";
import { useFormularioCompra } from "./use-formulario-compra";

/** Formulário de compra: quantidade, dados do comprador e geração do Pix. */
export function FormularioCompra() {
  const {
    cotas,
    setCotas,
    vendedor,
    setVendedor,
    dados,
    erros,
    falha,
    enviando,
    mudarCampo,
    enviar,
  } = useFormularioCompra();

  return (
    <Card className="py-6">
      <CardContent className="space-y-5">
        <div>
          <h3 className="text-xl font-extrabold">Comprar meus números</h3>
          <p className="text-sm text-muted-foreground">
            Leva menos de um minuto.
          </p>
        </div>

        {falha && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          >
            {falha}
          </p>
        )}

        <form onSubmit={enviar} noValidate className="space-y-5">
          <SeletorCotas cotas={cotas} aoMudar={setCotas} />
          <CamposComprador dados={dados} erros={erros} aoMudar={mudarCampo} />
          <SeletorVendedor valor={vendedor} aoMudar={setVendedor} />

          <Button type="submit" size="lg" className="w-full" disabled={enviando}>
            {enviando ? (
              "Gerando seu Pix..."
            ) : (
              <>
                <QrCode /> Pagar {brl(cotas * RIFA.precoCota)} com Pix{" "}
                <ArrowRight />
              </>
            )}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground">
          O CPF é exigido pelo banco para emitir o Pix e serve para identificar o
          ganhador. Seus dados são usados apenas para esta rifa.
        </p>
      </CardContent>
    </Card>
  );
}
