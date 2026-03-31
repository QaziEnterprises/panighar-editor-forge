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

  const handlePrintDaySummary = async (date: string) => {
    const day = summaries.find(s => s.date === date);
    if (!day) return;

    const dateDisplay = new Date(date + "T00:00:00").toLocaleDateString("en-PK", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
    const timeStr = new Date().toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", hour12: true });

    // Fetch full data: sales with items, contacts, expenses
    const [{ data: salesRaw }, { data: contacts }, { data: saleItems }, { data: expensesRaw }] = await Promise.all([
      supabase.from("sale_transactions").select("id, invoice_no, total, payment_method, payment_status, customer_id, date").eq("date", date),
      supabase.from("contacts").select("id, name"),
      supabase.from("sale_items").select("sale_id, product_name, quantity, unit_price, subtotal"),
      supabase.from("expenses").select("id, amount, description, payment_method, reference_no").eq("date", date),
    ]);

    const contactMap = new Map((contacts || []).map(c => [c.id, c.name]));
    const itemsMap = new Map<string, any[]>();
    for (const item of (saleItems || [])) {
      if (!itemsMap.has(item.sale_id)) itemsMap.set(item.sale_id, []);
      itemsMap.get(item.sale_id)!.push(item);
    }

    const bills = (salesRaw || []).map(s => ({
      id: s.id,
      invoice_no: s.invoice_no,
      total: Number(s.total || 0),
      payment_method: s.payment_method,
      payment_status: s.payment_status,
      customer_name: s.customer_id ? (contactMap.get(s.customer_id) || "Unknown") : "Walk-in",
      items: (itemsMap.get(s.id) || []).map(i => ({
        product_name: i.product_name,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        subtotal: Number(i.subtotal),
      })),
    }));

    const expenses = (expensesRaw || []).map(e => ({
      amount: Number(e.amount || 0),
      description: e.description,
      payment_method: e.payment_method,
      reference_no: e.reference_no,
    }));

    // Build bill table HTML
    const buildBillTable = (billList: typeof bills, shade: string) => {
      if (billList.length === 0) return `<p style="color:#888;font-style:italic;margin:4px 0 12px;">No bills</p>`;
      const sectionTotal = billList.reduce((s, b) => s + b.total, 0);
      let html = `<table><thead><tr><th>#</th><th>Invoice</th><th>Customer</th><th>Products</th><th class="text-right">Amount (PKR)</th></tr></thead><tbody>`;
      billList.forEach((b, i) => {
        const products = b.items.map(it => `${it.product_name || "Item"} x${it.quantity}`).join(", ") || "—";
        html += `<tr style="background:${shade}"><td>${i + 1}</td><td>${b.invoice_no || "—"}</td><td>${b.customer_name}</td><td style="font-size:10px;max-width:200px;word-wrap:break-word;">${products}</td><td class="text-right bold">PKR ${b.total.toLocaleString()}</td></tr>`;
      });
      html += `</tbody><tfoot><tr style="background:#000;color:#fff;"><td colspan="4" class="bold">Section Total (${billList.length} bills)</td><td class="text-right bold">PKR ${sectionTotal.toLocaleString()}</td></tr></tfoot></table>`;
      return html;
    };

    const paymentMethods = [
      { key: "cash", label: "💵 Cash Bills", shade: "#fff" },
      { key: "bank", label: "🏦 Bank Transfer Bills", shade: "#e8e8e8" },
      { key: "jazzcash", label: "📱 JazzCash Bills", shade: "#d0d0d0" },
      { key: "easypaisa", label: "📲 EasyPaisa Bills", shade: "#ddd" },
    ];

    let billSectionsHtml = "";
    for (const pm of paymentMethods) {
      const filtered = bills.filter(b => b.payment_method === pm.key && b.payment_status === "paid");
      billSectionsHtml += `<p class="section-title">${pm.label}</p>`;
      billSectionsHtml += buildBillTable(filtered, pm.shade);
    }

    const creditBills = bills.filter(b => b.payment_status === "due" || b.payment_status === "partial");
    billSectionsHtml += `<p class="section-title">📋 Credit / Udhar Bills</p>`;
    billSectionsHtml += buildBillTable(creditBills, "#b8b8b8");

    const knownMethods = new Set(["cash", "bank", "jazzcash", "easypaisa"]);
    const otherBills = bills.filter(b => b.payment_status === "paid" && !knownMethods.has(b.payment_method || ""));
    if (otherBills.length > 0) {
      billSectionsHtml += `<p class="section-title">🔖 Other Payment Method Bills</p>`;
      billSectionsHtml += buildBillTable(otherBills, "#c8c8c8");
    }

    // Expenses section
    const totalExpensesAmt = expenses.reduce((s, e) => s + e.amount, 0);
    let expensesHtml = `<p class="section-title">💰 Expenses</p>`;
    if (expenses.length === 0) {
      expensesHtml += `<p style="color:#888;font-style:italic;margin:4px 0 12px;">No expenses</p>`;
    } else {
      expensesHtml += `<table><thead><tr><th>#</th><th>Description</th><th>Payment</th><th>Ref</th><th class="text-right">Amount (PKR)</th></tr></thead><tbody>`;
      expenses.forEach((e, i) => {
        expensesHtml += `<tr><td>${i + 1}</td><td>${e.description || "—"}</td><td>${e.payment_method || "—"}</td><td>${e.reference_no || "—"}</td><td class="text-right bold">PKR ${e.amount.toLocaleString()}</td></tr>`;
      });
      expensesHtml += `</tbody><tfoot><tr style="background:#000;color:#fff;"><td colspan="4" class="bold">Total Expenses (${expenses.length})</td><td class="text-right bold">PKR ${totalExpensesAmt.toLocaleString()}</td></tr></tfoot></table>`;
    }

    // Payment method totals
    const cashTotal = bills.filter(b => b.payment_method === "cash" && b.payment_status === "paid").reduce((s, b) => s + b.total, 0);
    const bankTotal = bills.filter(b => b.payment_method === "bank" && b.payment_status === "paid").reduce((s, b) => s + b.total, 0);
    const jcTotal = bills.filter(b => b.payment_method === "jazzcash" && b.payment_status === "paid").reduce((s, b) => s + b.total, 0);
    const epTotal = bills.filter(b => b.payment_method === "easypaisa" && b.payment_status === "paid").reduce((s, b) => s + b.total, 0);
    const creditTotal = creditBills.reduce((s, b) => s + b.total, 0);

    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Please allow popups"); return; }
    printWindow.document.write(`<html><head><title>Daily Summary - ${date}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; font-size: 12px; color: #000; }
      h1 { text-align: center; font-size: 18px; margin-bottom: 4px; }
      .tagline { text-align: center; font-size: 12px; color: #333; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px; }
      .header-divider { width: 60%; margin: 8px auto; border-top: 2px solid #000; border-bottom: 1px solid #000; padding-top: 2px; }
      .subtitle { text-align: center; font-size: 11px; color: #555; margin-bottom: 2px; }
      .subtitle:last-of-type { margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th, td { border: 1px solid #000; padding: 5px 8px; text-align: left; font-size: 11px; }
      th { font-weight: 700; font-size: 10px; text-transform: uppercase; background: #f0f0f0; }
      .text-right { text-align: right; }
      .text-center { text-align: center; }
      .bold { font-weight: 700; }
      .section-title { font-size: 13px; font-weight: 700; margin: 16px 0 8px; border-bottom: 2px solid #000; padding-bottom: 4px; }
      .grand-total { background: #000; color: #fff; font-size: 13px; }
      .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #888; border-top: 1px dashed #999; padding-top: 8px; }
      @media print { body { padding: 0; } }
    </style></head><body>
      <h1>Qazi Enterprises</h1>
      <p class="tagline">Wholesale & Retail — Building Materials & General Store</p>
      <div class="header-divider"></div>
      <p class="subtitle">📊 Daily Summary Report</p>
      <p class="subtitle">${dateDisplay} · Generated at ${timeStr}</p>

      <p class="section-title">Overview</p>
      <table>
        <thead><tr><th>Category</th><th class="text-center">Count</th><th class="text-right">Amount (PKR)</th></tr></thead>
        <tbody>
          <tr><td class="bold">Total Sales</td><td class="text-center">${day.salesCount}</td><td class="text-right bold">PKR ${day.totalSales.toLocaleString()}</td></tr>
          <tr><td class="bold">Total Purchases</td><td class="text-center">${day.purchasesCount}</td><td class="text-right bold">PKR ${day.totalPurchases.toLocaleString()}</td></tr>
          <tr><td class="bold">Total Expenses</td><td class="text-center">${day.expensesCount}</td><td class="text-right bold">PKR ${day.totalExpenses.toLocaleString()}</td></tr>
          <tr class="grand-total"><td class="bold" colspan="2">Net Profit / Loss</td><td class="text-right bold">PKR ${day.profit.toLocaleString()}</td></tr>
        </tbody>
      </table>

      ${billSectionsHtml}
      ${expensesHtml}

      <p class="section-title">End of Day Closing</p>
      <table>
        <tbody>
          <tr style="background:#fff;"><td class="bold">Cash in Hand</td><td class="text-right bold">PKR ${cashTotal.toLocaleString()}</td></tr>
          <tr style="background:#e8e8e8;"><td class="bold">Bank Transfer</td><td class="text-right bold">PKR ${bankTotal.toLocaleString()}</td></tr>
          <tr style="background:#d0d0d0;"><td class="bold">JazzCash</td><td class="text-right bold">PKR ${jcTotal.toLocaleString()}</td></tr>
          <tr style="background:#ddd;"><td class="bold">EasyPaisa</td><td class="text-right bold">PKR ${epTotal.toLocaleString()}</td></tr>
          <tr style="background:#b8b8b8;"><td class="bold">Credit Given (Udhar)</td><td class="text-right bold">PKR ${creditTotal.toLocaleString()}</td></tr>
          <tr class="grand-total"><td class="bold">Total Day Sales</td><td class="text-right bold">PKR ${day.totalSales.toLocaleString()}</td></tr>
        </tbody>
      </table>

      <div class="footer"><p>Qazi Enterprises — Panighar · All Rights Reserved</p></div>
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
