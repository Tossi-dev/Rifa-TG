import { ArrowRight, CircleCheck, QrCode, ShieldCheck, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RIFA, brl } from "@/lib/config";
import { ContadorSorteio } from "./contador-sorteio";
import { PalcoPremio } from "./palco-premio";
import { ProgressoCotas } from "./progresso-cotas";
import type { ResumoCotas } from "@/lib/store";

const provas = [
  { Icone: QrCode, texto: "Pix com confirmação automática" },
  { Icone: CircleCheck, texto: "Números na hora" },
  { Icone: ShieldCheck, texto: "Sorteio pela Loteria Federal" },
];

/** Primeira dobra: promessa, preço, CTA, progresso e contagem regressiva. */
export function Hero({ resumo }: { resumo: ResumoCotas }) {
  return (
    <section id="topo" className="bg-gradient-to-b from-verde-claro/70 to-background">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-2 lg:items-center lg:py-16">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-verde/30 bg-card px-3 py-1 text-xs font-bold text-verde-escuro">
            <span className="animacao-pulso size-2 rounded-full bg-verde" />
            Sorteio em {RIFA.dataSorteioLabel}
          </span>

          <h1 className="mt-4 text-4xl leading-[1.05] font-extrabold sm:text-5xl">
            Uma <em className="text-verde not-italic">moto elétrica</em> 0km pode
            ser sua por {brl(RIFA.precoCota)}
          </h1>

          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Rifa oficial do {RIFA.organizador} de {RIFA.cidade}. São três prêmios,
            pagamento por Pix e os seus números na tela na mesma hora.
          </p>

          <div className="mt-6 flex items-baseline gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
            <strong className="text-3xl font-extrabold text-verde">
              {brl(RIFA.precoCota)}
            </strong>
            <span className="text-sm text-muted-foreground">
              por número · vale para os 3 prêmios
            </span>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <a href="#comprar">
                Quero meus números <ArrowRight />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#premios">
                <Trophy /> Ver os prêmios
              </a>
            </Button>
          </div>

          <div className="mt-6 space-y-3">
            <ProgressoCotas inicial={resumo} />
            <ContadorSorteio ate={RIFA.dataSorteio} />
          </div>

          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {provas.map(({ Icone, texto }) => (
              <li key={texto} className="flex items-center gap-2">
                <Icone className="size-4 text-verde" /> {texto}
              </li>
            ))}
          </ul>
        </div>

        <PalcoPremio premio={RIFA.premios[0]} />
      </div>
    </section>
  );
}
