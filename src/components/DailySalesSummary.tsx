import { useState, useEffect, useRef } from "react";
import { Banknote, CreditCard, Clock, TrendingUp, RefreshCw, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/customClient";
import { retryQuery } from "@/lib/retryFetch";
import { toast } from "sonner";

interface DailySummaryData {
  totalSales: number;
  salesCount: number;
  cashSales: number;
  bankSales: number;
  jazzCashSales: number;
  easyPaisaSales: number;
  creditSales: number;
  paidSales: number;
  partialSales: number;
  dueSales: number;
  totalPurchases: number;
  totalExpenses: number;
  purchasesCount: number;
  expensesCount: number;
}

export default function DailySalesSummary() {
  const [summary, setSummary] = useState<DailySummaryData>({
    totalSales: 0, salesCount: 0, cashSales: 0, bankSales: 0,
    jazzCashSales: 0, easyPaisaSales: 0, creditSales: 0,
    paidSales: 0, partialSales: 0, dueSales: 0,
    totalPurchases: 0, totalExpenses: 0, purchasesCount: 0, expensesCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const printRef = useRef<HTMLDivElement>(null);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
      const [{ data: sales }, { data: purchases }, { data: expenses }] = await Promise.all([
        retryQuery(() => supabase.from("sale_transactions").select("total, payment_method, payment_status").eq("date", todayStr)),
        retryQuery(() => supabase.from("purchases").select("total").eq("date", todayStr)),
        retryQuery(() => supabase.from("expenses").select("amount").eq("date", todayStr)),
      ]);

      const allSales = (sales as any[]) || [];
      const allPurchases = (purchases as any[]) || [];
      const allExpenses = (expenses as any[]) || [];
      
      const totalSales = allSales.reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      const totalPurchases = allPurchases.reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      const totalExpenses = allExpenses.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      
      const cashSales = allSales.filter((r: any) => r.payment_method === "cash" && r.payment_status === "paid")
        .reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      const bankSales = allSales.filter((r: any) => r.payment_method === "bank" && r.payment_status === "paid")
        .reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      const jazzCashSales = allSales.filter((r: any) => r.payment_method === "jazzcash" && r.payment_status === "paid")
        .reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      const easyPaisaSales = allSales.filter((r: any) => r.payment_method === "easypaisa" && r.payment_status === "paid")
        .reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      
      const paidSales = allSales.filter((r: any) => r.payment_status === "paid")
        .reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      const dueSales = allSales.filter((r: any) => r.payment_status === "due")
        .reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      const partialSales = allSales.filter((r: any) => r.payment_status === "partial")
        .reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      const creditSales = dueSales + partialSales;

      setSummary({
        totalSales, salesCount: allSales.length,
        cashSales, bankSales, jazzCashSales, easyPaisaSales,
        creditSales, paidSales, partialSales, dueSales,
        totalPurchases, totalExpenses,
        purchasesCount: allPurchases.length, expensesCount: allExpenses.length,
      });
      setLastUpdated(new Date());
    } catch (e) {
      console.error("Daily summary fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handlePrint = () => {
    const todayStr = new Date().toLocaleDateString("en-PK", { 
      weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Karachi" 
    });
    const timeStr = new Date().toLocaleTimeString("en-PK", { 
      hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" 
    });
    const netProfit = summary.totalSales - summary.totalPurchases - summary.totalExpenses;

    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Please allow popups to print"); return; }
    printWindow.document.write(`
      <html><head><title>Daily Summary - ${todayStr}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; font-size: 12px; color: #000; }
        h1 { text-align: center; font-size: 18px; margin-bottom: 4px; }
        .tagline { text-align: center; font-size: 12px; color: #333; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px; }
        .header-divider { width: 60%; margin: 8px auto; border-top: 2px solid #000; border-bottom: 1px solid #000; padding-top: 2px; }
        .subtitle { text-align: center; font-size: 11px; color: #555; margin-bottom: 2px; }
        .subtitle:last-of-type { margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th, td { border: 1px solid #000; padding: 6px 10px; text-align: left; }
        th { font-weight: 700; font-size: 11px; text-transform: uppercase; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .bold { font-weight: 700; }
        .section-title { font-size: 13px; font-weight: 700; margin: 16px 0 8px; border-bottom: 2px solid #000; padding-bottom: 4px; }
        /* B&W shading for payment methods */
        .shade-cash { background: #fff; }
        .shade-bank { background: #e0e0e0; }
        .shade-jazzcash { background: #c0c0c0; }
        .shade-easypaisa { background: #d5d5d5; }
        .shade-credit { background: #b0b0b0; }
        .grand-total { background: #000; color: #fff; font-size: 14px; }
        .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #888; border-top: 1px dashed #999; padding-top: 8px; }
        @media print { body { padding: 0; } }
      </style></head><body>
        <h1>Qazi Enterprises</h1>
        <p class="tagline">Wholesale & Retail — Building Materials & General Store</p>
        <div class="header-divider"></div>
        <p class="subtitle">📊 Daily Summary Report</p>
        <p class="subtitle">${todayStr} · Generated at ${timeStr}</p>

        <p class="section-title">Overview</p>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th class="text-center">Count</th>
              <th class="text-right">Amount (PKR)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="bold">Total Sales</td>
              <td class="text-center">${summary.salesCount}</td>
              <td class="text-right bold">PKR ${summary.totalSales.toLocaleString()}</td>
            </tr>
            <tr>
              <td class="bold">Total Purchases</td>
              <td class="text-center">${summary.purchasesCount}</td>
              <td class="text-right bold">PKR ${summary.totalPurchases.toLocaleString()}</td>
            </tr>
            <tr>
              <td class="bold">Total Expenses</td>
              <td class="text-center">${summary.expensesCount}</td>
              <td class="text-right bold">PKR ${summary.totalExpenses.toLocaleString()}</td>
            </tr>
            <tr class="grand-total">
              <td class="bold" colspan="2">Net Profit / Loss</td>
              <td class="text-right bold">PKR ${netProfit.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        <p class="section-title">Sales by Payment Method</p>
        <table>
          <thead>
            <tr>
              <th>Payment Method</th>
              <th class="text-right">Amount (PKR)</th>
            </tr>
          </thead>
          <tbody>
            <tr class="shade-cash">
              <td>💵 Cash</td>
              <td class="text-right bold">PKR ${summary.cashSales.toLocaleString()}</td>
            </tr>
            <tr class="shade-bank">
              <td>🏦 Bank Transfer</td>
              <td class="text-right bold">PKR ${summary.bankSales.toLocaleString()}</td>
            </tr>
            <tr class="shade-jazzcash">
              <td>📱 JazzCash</td>
              <td class="text-right bold">PKR ${summary.jazzCashSales.toLocaleString()}</td>
            </tr>
            <tr class="shade-easypaisa">
              <td>📲 EasyPaisa</td>
              <td class="text-right bold">PKR ${summary.easyPaisaSales.toLocaleString()}</td>
            </tr>
            <tr class="shade-credit">
              <td>📋 Credit / Due (Udhar)</td>
              <td class="text-right bold">PKR ${summary.creditSales.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        <p class="section-title">End of Day Closing</p>
        <table>
          <tbody>
            <tr class="shade-cash">
              <td class="bold">Cash in Hand</td>
              <td class="text-right bold">PKR ${summary.cashSales.toLocaleString()}</td>
            </tr>
            <tr class="shade-bank">
              <td class="bold">Bank / Digital Received</td>
              <td class="text-right bold">PKR ${(summary.bankSales + summary.jazzCashSales + summary.easyPaisaSales).toLocaleString()}</td>
            </tr>
            <tr class="shade-credit">
              <td class="bold">Credit Given (Udhar)</td>
              <td class="text-right bold">PKR ${summary.creditSales.toLocaleString()}</td>
            </tr>
            <tr class="grand-total">
              <td class="bold">Total Day Sales</td>
              <td class="text-right bold">PKR ${summary.totalSales.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <p>Generated at ${timeStr} — Qazi Enterprises</p>
        </div>
        <script>window.onload = function() { window.print(); window.close(); }<\/script>
      </body></html>
    `);
    printWindow.document.close();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Daily Sales Summary
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              Updated: {lastUpdated.toLocaleTimeString("en-PK", { timeZone: "Asia/Karachi" })}
            </span>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handlePrint} title="Print Summary">
              <Printer className="h-3 w-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={fetchSummary} disabled={loading}>
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total */}
        <div className="text-center p-3 rounded-lg bg-primary/5 border">
          <p className="text-xs text-muted-foreground mb-1">Today's Total Sales</p>
          <p className="text-3xl font-bold text-primary">PKR {summary.totalSales.toLocaleString()}</p>
          <Badge variant="secondary" className="mt-1 text-[10px]">{summary.salesCount} transactions</Badge>
        </div>

        {/* Payment Method Breakdown */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">By Payment Method</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between p-2 rounded-lg border bg-card">
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-foreground" />
                <span className="text-xs">Cash</span>
              </div>
              <span className="text-sm font-bold">PKR {summary.cashSales.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg border bg-muted/50">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-foreground" />
                <span className="text-xs">Bank</span>
              </div>
              <span className="text-sm font-bold">PKR {summary.bankSales.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold w-4 text-center">JC</span>
                <span className="text-xs">JazzCash</span>
              </div>
              <span className="text-sm font-bold">PKR {summary.jazzCashSales.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg border bg-muted/40">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold w-4 text-center">EP</span>
                <span className="text-xs">EasyPaisa</span>
              </div>
              <span className="text-sm font-bold">PKR {summary.easyPaisaSales.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Payment Status Breakdown */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">By Payment Status</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-sm">Paid (Collected)</span>
              </div>
              <span className="text-sm font-bold">PKR {summary.paidSales.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                <span className="text-sm">Credit / Due (Udhar)</span>
              </div>
              <span className="text-sm font-bold">PKR {summary.creditSales.toLocaleString()}</span>
            </div>
            {summary.dueSales > 0 && (
              <div className="flex items-center justify-between pl-4">
                <span className="text-xs text-muted-foreground">└ Full Due</span>
                <span className="text-xs font-medium">PKR {summary.dueSales.toLocaleString()}</span>
              </div>
            )}
            {summary.partialSales > 0 && (
              <div className="flex items-center justify-between pl-4">
                <span className="text-xs text-muted-foreground">└ Partial</span>
                <span className="text-xs font-medium">PKR {summary.partialSales.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* End of Day Summary */}
        <div className="rounded-lg border-2 border-dashed p-3 space-y-1">
          <p className="text-xs font-semibold flex items-center gap-1">
            <Clock className="h-3 w-3" /> End of Day Closing
          </p>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Cash in Hand:</span>
            <span className="font-bold">PKR {summary.cashSales.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Bank Received:</span>
            <span className="font-bold">PKR {(summary.bankSales + summary.jazzCashSales + summary.easyPaisaSales).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Credit Given:</span>
            <span className="font-bold">PKR {summary.creditSales.toLocaleString()}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-sm font-bold">
            <span>Total Day Sales:</span>
            <span className="text-primary">PKR {summary.totalSales.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Purchases:</span>
            <span className="font-bold">PKR {summary.totalPurchases.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Expenses:</span>
            <span className="font-bold">PKR {summary.totalExpenses.toLocaleString()}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-sm font-bold">
            <span>Net Profit:</span>
            <span className={summary.totalSales - summary.totalPurchases - summary.totalExpenses >= 0 ? "text-primary" : "text-destructive"}>
              PKR {(summary.totalSales - summary.totalPurchases - summary.totalExpenses).toLocaleString()}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
