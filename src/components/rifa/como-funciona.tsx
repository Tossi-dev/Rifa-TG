import { Card, CardContent } from "@/components/ui/card";
import { RIFA, brl } from "@/lib/config";
import { TituloSecao } from "./titulo-secao";

const passos = [
  {
    titulo: "Escolha a quantidade",
    texto: `Cada número custa ${brl(RIFA.precoCota)}. Quanto mais números, mais chances nos três prêmios.`,
  },
  {
    titulo: "Preencha seus dados",
    texto:
      "Nome, WhatsApp e CPF. É por aí que a gente entra em contato se você ganhar.",
  },
  {
    titulo: "Pague com Pix",
    texto:
      "O QR Code aparece na hora. Pague pelo app do seu banco em segundos.",
  },
  {
    titulo: "Receba seus números",
    texto:
      "Assim que o Pix cai, seus números aparecem na tela e ficam registrados no seu nome.",
  },
];

/** Explicação do fluxo de compra em quatro passos. */
export function ComoFunciona() {
  return (
    <section id="como-funciona" className="py-14">
      <div className="mx-auto max-w-6xl px-4">
        <TituloSecao
          etiqueta="Como funciona"
          titulo="Do celular, em quatro passos"
        />

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {passos.map((passo, indice) => (
            <Card key={passo.titulo} className="gap-3 py-5">
              <CardContent className="px-5">
                <span className="grid size-9 place-items-center rounded-full bg-verde text-sm font-extrabold text-primary-foreground">
                  {indice + 1}
                </span>
                <h3 className="mt-3 text-lg font-bold">{passo.titulo}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {passo.texto}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
