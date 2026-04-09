
import React, { useState } from 'react';
import { 
  Zap, 
  ChevronRight, 
  CheckCircle2, 
  Rocket, 
  Layout, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);

  const steps = [
    {
      title: "Welcome to Integrator",
      description: "The modern way to automate your business workflows. Let's get you set up in 60 seconds.",
      icon: Zap,
      color: "text-indigo-500",
      bg: "bg-indigo-500/10"
    },
    {
      title: "Choose a Template",
      description: "Don't start from scratch. Pick a pre-built flow and customize it to your needs.",
      icon: Layout,
      color: "text-amber-500",
      bg: "bg-amber-500/10"
    },
    {
      title: "Connect Your Apps",
      description: "Integrate with Slack, Salesforce, Stripe, and 100+ other services with one click.",
      icon: Sparkles,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10"
    },
    {
      title: "Ready for Launch",
      description: "Your first workflow is ready to run. Monitor everything from your new dashboard.",
      icon: Rocket,
      color: "text-rose-500",
      bg: "bg-rose-500/10"
    }
  ];

  const currentStep = steps[step - 1];

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="bg-zinc-900 border-zinc-800 overflow-hidden shadow-2xl">
              <CardContent className="p-12 text-center space-y-8">
                <div className={`w-20 h-20 mx-auto rounded-2xl ${currentStep.bg} flex items-center justify-center ${currentStep.color}`}>
                  <currentStep.icon size={40} />
                </div>
                
                <div className="space-y-3">
                  <h2 className="text-3xl font-bold text-white tracking-tight">{currentStep.title}</h2>
                  <p className="text-zinc-400 text-lg max-w-md mx-auto">{currentStep.description}</p>
                </div>

                <div className="flex items-center justify-center gap-2">
                  {steps.map((_, i) => (
                    <div 
                      key={i} 
                      className={`h-1.5 rounded-full transition-all duration-300 ${i + 1 === step ? "w-8 bg-indigo-500" : "w-2 bg-zinc-800"}`}
                    />
                  ))}
                </div>

                <div className="pt-4">
                  {step < steps.length ? (
                    <Button 
                      onClick={() => setStep(step + 1)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-6 text-lg font-bold gap-2 rounded-xl group"
                    >
                      Continue
                      <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </Button>
                  ) : (
                    <Button 
                      onClick={onComplete}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-6 text-lg font-bold gap-2 rounded-xl shadow-lg shadow-emerald-500/20"
                    >
                      Go to Dashboard
                      <ArrowRight size={20} />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 text-center">
          <button 
            onClick={onComplete}
            className="text-zinc-600 hover:text-zinc-400 text-sm font-medium transition-colors"
          >
            Skip onboarding
          </button>
        </div>
      </div>
    </div>
  );
}
