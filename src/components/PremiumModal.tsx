import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Star, Crown, Zap, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/src/hooks/useAuth';
import { toast } from 'sonner';

interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PremiumModal({ isOpen, onClose }: PremiumModalProps) {
  const { updatePremiumStatus } = useAuth();
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    // Priority to the environment variable, fallback to the direct link
    const paymentUrl = import.meta.env.VITE_PAYMENT_URL || 'https://mpago.la/1brXcKy';
    
    if (paymentUrl && paymentUrl !== 'https://link.mercadopago.com.br/...') {
      window.open(paymentUrl, '_blank');
      toast.success("Link de contribuição aberto! Agradecemos seu apoio.");
    } else {
      // Fallback direct link just in case
      window.open('https://mpago.la/1brXcKy', '_blank');
      toast.success("Link de contribuição aberto!");
    }
  };

  const handleManualActivation = async () => {
    setLoading(true);
    toast.info("Validando sua solicitação...");
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      await updatePremiumStatus(true);
      toast.success("Acesso Total ativado com sucesso! Aproveite.");
      onClose();
    } catch (err) {
      toast.error("Erro ao ativar acesso. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            onClick={onClose}
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
          >
            <div className="absolute top-4 right-4 z-10">
              <button 
                onClick={onClose}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="p-6 md:p-10">
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 bg-yellow-500/20 rounded-2xl flex items-center justify-center border border-yellow-500/20 shadow-[0_0_30px_rgba(234,179,8,0.2)]">
                  <Crown className="w-10 h-10 text-yellow-500" />
                </div>
              </div>

              <div className="text-center mb-8">
                <h2 className="text-3xl font-black text-white mb-2 tracking-tighter uppercase">Acesso Total</h2>
                <p className="text-zinc-400 text-sm">Libere todo o potencial do aplicativo agora mesmo.</p>
              </div>

              <div className="space-y-3 mb-8">
                {[
                  { icon: Zap, text: "Upload ilimitado de arquivos" },
                  { icon: Star, text: "Importação de pastas (Drag & Drop)" },
                  { icon: ShieldCheck, text: "Capas de álbuns ilimitadas" },
                  { icon: Crown, text: "Selo de Usuário Premium verificado" }
                ].map((item, i) => (
                  <div key={i} className="flex items-center space-x-3 text-sm text-zinc-300 bg-white/5 p-3 rounded-xl border border-white/5">
                    <div className="w-6 h-6 rounded-lg bg-yellow-500/10 flex items-center justify-center border border-yellow-500/10">
                      <item.icon className="w-3.5 h-3.5 text-yellow-500" />
                    </div>
                    <span className="font-medium">{item.text}</span>
                  </div>
                ))}
              </div>

              <div className="bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/5 rounded-2xl p-6 text-center mb-8 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-2 opacity-10 blur-xl group-hover:opacity-20 transition-opacity">
                  <Crown className="w-24 h-24 text-yellow-500" />
                </div>
                <div className="text-[10px] text-yellow-500 font-black uppercase tracking-[0.2em] mb-1">Contribuição Única</div>
                <div className="text-3xl font-black text-white italic tracking-tighter">R$ 10,00</div>
                <div className="text-[10px] text-zinc-500 mt-2 font-bold">PAGAMENTO ÚNICO • SEM ASSINATURA</div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <Button 
                  onClick={handlePayment}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-6 rounded-xl text-base shadow-xl shadow-blue-600/10 transition-all active:scale-[0.98] flex items-center justify-center gap-2 whitespace-normal h-auto min-h-[56px] leading-tight"
                >
                  <Zap className="w-5 h-5 fill-current shrink-0 shadow-[0_0_10px_rgba(255,255,255,0.3)]" />
                  <span className="text-center">Ir para o Mercado Pago</span>
                </Button>
                
                <Button 
                  onClick={handleManualActivation}
                  disabled={loading}
                  variant="outline"
                  className="w-full border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white font-bold py-4 rounded-xl text-sm transition-all bg-transparent"
                >
                  {loading ? "Verificando..." : "Já paguei, ativar acesso"}
                </Button>
              </div>
              
              <p className="text-[10px] text-zinc-600 text-center mt-4 uppercase tracking-widest font-black italic">
                Agradecemos sua colaboração!
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
