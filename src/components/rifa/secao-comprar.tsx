import { Check } from "lucide-react";

import { RIFA, brl } from "@/lib/config";
import { FormularioCompra } from "./formulario-compra";

const vantagens = [
  "Você escolhe só a quantidade. Os números são atribuídos automaticamente assim que o Pix é confirmado — sem risco de dois compradores ficarem com o mesmo número.",
  "Pagamento por Pix com confirmação automática. Nada de mandar comprovante e ficar esperando resposta.",
  "Seus números aparecem na tela na hora em que o pagamento cai.",
  `Sorteio em ${RIFA.dataSorteioLabel}, pela ${RIFA.formaSorteio.toLowerCase()}.`,
];

/** Seção de conversão: argumentos à esquerda, formulário à direita. */
export function SecaoComprar() {
  return (
    <section id="comprar" className="bg-escuro py-14 text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-2 lg:items-start">
        <div>
          <span className="text-xs font-bold tracking-widest text-lima uppercase">
            Garanta suas cotas
          </span>
          <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">
            Escolha quantos números você quer levar
          </h2>
          <p className="mt-3 text-white/70">
            Cada número custa {brl(RIFA.precoCota)} e vale para os três prêmios.
            Você paga por Pix e recebe seus números na hora, direto na tela.
          </p>

          <ul className="mt-6 space-y-3">
            {vantagens.map((vantagem) => (
              <li key={vantagem} className="flex gap-3 text-sm text-white/80">
                <Check className="mt-0.5 size-4 shrink-0 text-lima" />
                <span>{vantagem}</span>
              </li>
            ))}
          </ul>
        </div>

        <FormularioCompra />
      </div>
    </section>
  );
}
