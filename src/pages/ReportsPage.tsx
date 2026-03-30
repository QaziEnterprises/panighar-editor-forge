import React, { useState, useEffect, useCallback, useMemo } from "react";
import { CalendarDays, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Receipt, Download, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/customClient";
import { motion } from "framer-motion";
import { exportToExcel } from "@/lib/exportUtils";
import { toast } from "sonner";
import DayTransactionsDialog from "@/components/reports/DayTransactionsDialog";
import DailyTrendChart from "@/components/reports/DailyTrendChart";

interface DailySummary {
  date: string;
  totalSales: number;
  totalPurchases: number;
  totalExpenses: number;
  profit: number;
  salesCount: number;
  purchasesCount: number;
  expensesCount: number;
}

interface InvoiceDetail {
  id: string;
  invoice_no: string | null;
  customer_name: string;
  total: number;
  payment_method: string;
  payment_status: string;
}

export default function ReportsPage() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<Record<string, InvoiceDetail[]>>({});

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [{ data: sales }, { data: purchases }, { data: expenses }] = await Promise.all([
          supabase.from("sale_transactions").select("date, total").gte("date", startDate).lte("date", endDate),
          supabase.from("purchases").select("date, total").gte("date", startDate).lte("date", endDate),
          supabase.from("expenses").select("date, amount").gte("date", startDate).lte("date", endDate),
        ]);


        const dateMap = new Map<string, DailySummary>();
        const getOrCreate = (date: string): DailySummary => {
          if (!dateMap.has(date)) dateMap.set(date, { date, totalSales: 0, totalPurchases: 0, totalExpenses: 0, profit: 0, salesCount: 0, purchasesCount: 0, expensesCount: 0 });
          return dateMap.get(date)!;
        };

        (sales || []).forEach((s) => { const d = getOrCreate(s.date); d.totalSales += Number(s.total || 0); d.salesCount++; });
        (purchases || []).forEach((p) => { const d = getOrCreate(p.date); d.totalPurchases += Number(p.total || 0); d.purchasesCount++; });
        (expenses || []).forEach((e) => { const d = getOrCreate(e.date); d.totalExpenses += Number(e.amount || 0); d.expensesCount++; });

        dateMap.forEach((d) => { d.profit = d.totalSales - d.totalPurchases - d.totalExpenses; });

        const sorted = Array.from(dateMap.values()).sort((a, b) => b.date.localeCompare(a.date));
        setSummaries(sorted);
      } catch (e) {
        console.error("Reports fetch error:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [startDate, endDate, refreshKey]);

  const totals = summaries.reduce(
    (acc, d) => ({
      sales: acc.sales + d.totalSales,
      purchases: acc.purchases + d.totalPurchases,
      expenses: acc.expenses + d.totalExpenses,
      profit: acc.profit + d.profit,
    }),
    { sales: 0, purchases: 0, expenses: 0, profit: 0 }
  );

  const handleDataChanged = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const toggleDateExpand = async (date: string) => {
    if (expandedDate === date) { setExpandedDate(null); return; }
    setExpandedDate(date);
    if (!invoiceDetails[date]) {
      const [{ data: salesData }, { data: contacts }] = await Promise.all([
        supabase.from("sale_transactions").select("id, invoice_no, customer_id, total, payment_method, payment_status").eq("date", date).order("created_at", { ascending: false }),
        supabase.from("contacts").select("id, name").eq("type", "customer"),
      ]);
      const contactMap: Record<string, string> = {};
      (contacts || []).forEach((c: any) => { contactMap[c.id] = c.name; });
      const details = (salesData || []).map((s: any) => ({
        id: s.id,
        invoice_no: s.invoice_no,
        customer_name: s.customer_id ? (contactMap[s.customer_id] || "Walk-in") : "Walk-in",
        total: Number(s.total || 0),
        payment_method: s.payment_method || "cash",
        payment_status: s.payment_status || "paid",
      }));
      setInvoiceDetails(prev => ({ ...prev, [date]: details }));
    }
  };

  const handlePrintDaySummary = (date: string) => {
    const day = summaries.find(s => s.date === date);
    const invoices = invoiceDetails[date] || [];
    if (!day) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Please allow popups"); return; }

    const cashInvoices = invoices.filter(i => i.payment_method === "cash" && i.payment_status === "paid");
    const bankInvoices = invoices.filter(i => i.payment_method === "bank" && i.payment_status === "paid");
    const jcInvoices = invoices.filter(i => i.payment_method === "jazzcash" && i.payment_status === "paid");
    const epInvoices = invoices.filter(i => i.payment_method === "easypaisa" && i.payment_status === "paid");
    const dueInvoices = invoices.filter(i => i.payment_status === "due" || i.payment_status === "partial");

    const cashTotal = cashInvoices.reduce((s, i) => s + i.total, 0);
    const bankTotal = bankInvoices.reduce((s, i) => s + i.total, 0);
    const jcTotal = jcInvoices.reduce((s, i) => s + i.total, 0);
    const epTotal = epInvoices.reduce((s, i) => s + i.total, 0);
    const dueTotal = dueInvoices.reduce((s, i) => s + i.total, 0);

    const invoiceRows = invoices.map((inv, i) =>
      `<tr><td>${i + 1}</td><td>${inv.invoice_no || "—"}</td><td>${inv.customer_name}</td><td>${inv.payment_method.toUpperCase()}</td><td style="text-transform:capitalize">${inv.payment_status}</td><td style="text-align:right;font-weight:600">PKR ${inv.total.toLocaleString()}</td></tr>`
    ).join("");

    printWindow.document.write(`<html><head><title>Daily Summary - ${date}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', sans-serif; padding: 20px; font-size: 12px; color: #222; }
      h1 { font-size: 20px; text-align: center; margin-bottom: 4px; }
      .subtitle { text-align: center; color: #666; font-size: 12px; margin-bottom: 16px; }
      .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; border: 1px solid #ddd; padding: 12px; border-radius: 4px; }
      .summary-item { display: flex; justify-content: space-between; padding: 4px 0; }
      .summary-item.total { border-top: 2px solid #000; padding-top: 8px; font-size: 14px; font-weight: 700; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; font-size: 11px; }
      th { background: #f5f5f5; font-weight: 600; }
      .section-title { font-size: 14px; font-weight: 700; margin: 16px 0 8px; border-bottom: 1px solid #000; padding-bottom: 4px; }
      .footer { text-align: center; margin-top: 24px; font-size: 10px; color: #888; border-top: 1px dashed #ccc; padding-top: 8px; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <h1>Qazi Enterprises - Daily Summary</h1>
    <p class="subtitle">Date: ${date} | Generated: ${new Date().toLocaleString()}</p>

    <div class="summary-grid">
      <div>
        <div class="summary-item"><span>Total Sales (${day.salesCount} invoices):</span><span style="color:green;font-weight:600">PKR ${day.totalSales.toLocaleString()}</span></div>
        <div class="summary-item"><span>Total Purchases:</span><span style="color:blue;font-weight:600">PKR ${day.totalPurchases.toLocaleString()}</span></div>
        <div class="summary-item"><span>Total Expenses:</span><span style="color:red;font-weight:600">PKR ${day.totalExpenses.toLocaleString()}</span></div>
      </div>
      <div>
        <div class="summary-item"><span>Cash Sales:</span><span>PKR ${cashTotal.toLocaleString()}</span></div>
        <div class="summary-item"><span>Bank/JC/EP:</span><span>PKR ${(bankTotal + jcTotal + epTotal).toLocaleString()}</span></div>
        <div class="summary-item"><span>Credit/Due:</span><span style="color:orange">PKR ${dueTotal.toLocaleString()}</span></div>
      </div>
    </div>
    <div class="summary-grid" style="grid-template-columns:1fr">
      <div class="summary-item total"><span>Net Profit:</span><span style="color:${day.profit >= 0 ? 'green' : 'red'}">PKR ${day.profit.toLocaleString()}</span></div>
    </div>

    <p class="section-title">All Invoices (${invoices.length})</p>
    <table>
      <thead><tr><th>#</th><th>Invoice</th><th>Customer</th><th>Payment</th><th>Status</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${invoiceRows}</tbody>
      <tfoot><tr style="font-weight:700;background:#f5f5f5"><td colspan="5">Total</td><td style="text-align:right">PKR ${day.totalSales.toLocaleString()}</td></tr></tfoot>
    </table>

    <p class="section-title">Amount Breakdown</p>
    <table>
      <thead><tr><th>Method</th><th>Count</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>
        <tr><td>💵 Cash</td><td>${cashInvoices.length}</td><td style="text-align:right">PKR ${cashTotal.toLocaleString()}</td></tr>
        <tr><td>🏦 Bank</td><td>${bankInvoices.length}</td><td style="text-align:right">PKR ${bankTotal.toLocaleString()}</td></tr>
        <tr><td>📱 JazzCash</td><td>${jcInvoices.length}</td><td style="text-align:right">PKR ${jcTotal.toLocaleString()}</td></tr>
        <tr><td>📲 EasyPaisa</td><td>${epInvoices.length}</td><td style="text-align:right">PKR ${epTotal.toLocaleString()}</td></tr>
        <tr><td>⏳ Credit/Due</td><td>${dueInvoices.length}</td><td style="text-align:right;color:orange">PKR ${dueTotal.toLocaleString()}</td></tr>
      </tbody>
      <tfoot><tr style="font-weight:700;background:#f5f5f5"><td>Total</td><td>${invoices.length}</td><td style="text-align:right">PKR ${day.totalSales.toLocaleString()}</td></tr></tfoot>
    </table>

    <div class="footer"><p>Qazi Enterprises — All rights reserved</p></div>
    <script>window.onload = function() { window.print(); window.close(); }<\/script>
    </body></html>`);
    printWindow.document.close();
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daily Reports</h1>
          <p className="text-sm text-muted-foreground">Sales, purchases & expenses summary</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-2" disabled={summaries.length === 0} onClick={() => {
            exportToExcel(summaries.map(d => ({
              Date: d.date, Sales: d.totalSales, Purchases: d.totalPurchases,
              Expenses: d.totalExpenses, "Net Profit": d.profit,
              "Sales Count": d.salesCount, "Purchases Count": d.purchasesCount, "Expenses Count": d.expensesCount,
            })), "Daily_Reports");
            toast.success("Exported to Excel");
          }}><Download className="h-4 w-4" /> Excel</Button>
        </div>
      </div>

      <DayTransactionsDialog open={!!selectedDate} onOpenChange={(o) => !o && setSelectedDate(null)} date={selectedDate || ""} onDataChanged={handleDataChanged} />


      {/* Date Filters */}
      <div className="flex gap-4 mb-6 items-end">
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1"><CalendarDays className="h-3 w-3" /> From</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1"><CalendarDays className="h-3 w-3" /> To</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Sales</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">PKR {totals.sales.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Purchases</CardTitle>
            <ShoppingCart className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-600">PKR {totals.purchases.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
            <Receipt className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">PKR {totals.expenses.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Profit</CardTitle>
            <DollarSign className="h-4 w-4" />
          </CardHeader>
          <CardContent><div className={`text-2xl font-bold ${totals.profit >= 0 ? "text-green-600" : "text-destructive"}`}>PKR {totals.profit.toLocaleString()}</div></CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      {!loading && summaries.length > 1 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Daily Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyTrendChart data={summaries} />
          </CardContent>
        </Card>
      )}

      {/* Daily Table */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : summaries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">No transactions found for this date range.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Sales</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Purchases</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Expenses</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Net Profit</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Transactions</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((d, i) => (
                <React.Fragment key={d.date}>
                  <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => toggleDateExpand(d.date)}>
                    <td className="px-4 py-3 font-medium">{d.date}</td>
                    <td className="px-4 py-3 text-right text-green-600">PKR {d.totalSales.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-blue-600">PKR {d.totalPurchases.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-destructive">PKR {d.totalExpenses.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right font-bold ${d.profit >= 0 ? "text-green-600" : "text-destructive"}`}>
                      PKR {d.profit.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {d.salesCount > 0 && <Badge variant="secondary" className="text-xs">{d.salesCount} sale{d.salesCount > 1 ? "s" : ""}</Badge>}
                        {d.purchasesCount > 0 && <Badge variant="outline" className="text-xs">{d.purchasesCount} purch.</Badge>}
                        {d.expensesCount > 0 && <Badge variant="destructive" className="text-xs">{d.expensesCount} exp.</Badge>}
                      </div>
                    </td>
                  </motion.tr>
                  {expandedDate === d.date && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <div className="bg-muted/20 border-y p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold">Invoices for {d.date}</h4>
                            <Button size="sm" variant="outline" className="gap-2 h-7 text-xs" onClick={() => handlePrintDaySummary(d.date)}>
                              <Printer className="h-3 w-3" /> Print Summary
                            </Button>
                          </div>
                          {!invoiceDetails[d.date] ? (
                            <p className="text-sm text-muted-foreground">Loading...</p>
                          ) : invoiceDetails[d.date].length === 0 ? (
                            <p className="text-sm text-muted-foreground">No invoices for this date.</p>
                          ) : (
                            <>
                              <table className="w-full text-xs border rounded">
                                <thead>
                                  <tr className="bg-muted/50 border-b">
                                    <th className="px-3 py-2 text-left font-medium">#</th>
                                    <th className="px-3 py-2 text-left font-medium">Invoice</th>
                                    <th className="px-3 py-2 text-left font-medium">Customer</th>
                                    <th className="px-3 py-2 text-left font-medium">Payment</th>
                                    <th className="px-3 py-2 text-left font-medium">Status</th>
                                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {invoiceDetails[d.date].map((inv, idx) => (
                                    <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/20">
                                      <td className="px-3 py-1.5">{idx + 1}</td>
                                      <td className="px-3 py-1.5 font-mono">{inv.invoice_no || "—"}</td>
                                      <td className="px-3 py-1.5">{inv.customer_name}</td>
                                      <td className="px-3 py-1.5 capitalize">{inv.payment_method}</td>
                                      <td className="px-3 py-1.5">
                                        <Badge variant={inv.payment_status === "paid" ? "default" : "destructive"} className="text-[10px]">{inv.payment_status}</Badge>
                                      </td>
                                      <td className="px-3 py-1.5 text-right font-medium">PKR {inv.total.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <Separator className="my-3" />
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                <div className="rounded border p-2 bg-card">
                                  <span className="text-muted-foreground">Cash:</span>
                                  <span className="float-right font-bold">PKR {invoiceDetails[d.date].filter(i => i.payment_method === "cash" && i.payment_status === "paid").reduce((s, i) => s + i.total, 0).toLocaleString()}</span>
                                </div>
                                <div className="rounded border p-2 bg-card">
                                  <span className="text-muted-foreground">Bank:</span>
                                  <span className="float-right font-bold">PKR {invoiceDetails[d.date].filter(i => i.payment_method === "bank" && i.payment_status === "paid").reduce((s, i) => s + i.total, 0).toLocaleString()}</span>
                                </div>
                                <div className="rounded border p-2 bg-card">
                                  <span className="text-muted-foreground">JC/EP:</span>
                                  <span className="float-right font-bold">PKR {invoiceDetails[d.date].filter(i => (i.payment_method === "jazzcash" || i.payment_method === "easypaisa") && i.payment_status === "paid").reduce((s, i) => s + i.total, 0).toLocaleString()}</span>
                                </div>
                                <div className="rounded border p-2 bg-card">
                                  <span className="text-muted-foreground">Credit:</span>
                                  <span className="float-right font-bold text-amber-600">PKR {invoiceDetails[d.date].filter(i => i.payment_status === "due" || i.payment_status === "partial").reduce((s, i) => s + i.total, 0).toLocaleString()}</span>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/50 font-bold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right text-green-600">PKR {totals.sales.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-blue-600">PKR {totals.purchases.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-destructive">PKR {totals.expenses.toLocaleString()}</td>
                <td className={`px-4 py-3 text-right ${totals.profit >= 0 ? "text-green-600" : "text-destructive"}`}>PKR {totals.profit.toLocaleString()}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
