import { Suspense } from "react";
import JoinForm from "@/components/JoinForm";

async function Inner({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinForm token={token} />;
}
export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return <Suspense fallback={null}><Inner params={params} /></Suspense>;
}
