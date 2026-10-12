import { LearnerProgressDashboard } from "@/components/LearnerProgressDashboard";
import { LocalPatternsSection } from "@/components/LocalPatternsSection";
import { Navbar } from "@/components/Navbar";

export default function DashboardPage() {
  return <div className="min-h-screen bg-[#080808] text-neutral-200">
    <Navbar />
    <main className="pt-[104px] sm:pt-[120px]">
      <div className="mx-auto w-[min(1180px,calc(100%-40px))] pb-16 sm:pb-24">
        <div className="mb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">Learning dashboard</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-white sm:text-6xl">Your progress</h1>
        </div>
        <LocalPatternsSection />
        <LearnerProgressDashboard />
      </div>
    </main>
  </div>;
}
