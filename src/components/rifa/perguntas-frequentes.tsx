import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { RIFA } from "@/lib/config";
import { TituloSecao } from "./titulo-secao";

/** Dúvidas frequentes em accordion. */
export function PerguntasFrequentes() {
  return (
    <section id="duvidas" className="py-14">
      <div className="mx-auto max-w-3xl px-4">
        <TituloSecao etiqueta="Dúvidas" titulo="Perguntas frequentes" />

        <Card className="mt-8 px-6 py-2">
          <Accordion type="single" collapsible>
            {RIFA.faq.map((item, indice) => (
              <AccordionItem key={item.p} value={`pergunta-${indice}`}>
                <AccordionTrigger>{item.p}</AccordionTrigger>
                <AccordionContent>{item.r}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
      </div>
    </section>
  );
}
