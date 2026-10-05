import { PageHeader } from "@/components/ui";
import { NewDealForm } from "./NewDealForm";

export const metadata = { title: "New screening" };

export default function NewDealPage() {
  return (
    <>
      <PageHeader
        eyebrow="New opportunity"
        title="Screen a pitch deck"
        subtitle="Upload the deck and any supporting materials. The AI analyst researches the science, competitors and comparable transactions, then produces a full screening memo, a decision and a founder response — typically within a few minutes."
      />
      <NewDealForm />
    </>
  );
}
