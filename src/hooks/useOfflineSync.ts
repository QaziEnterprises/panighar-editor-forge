import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/customClient";
import { toast } from "sonner";

const OFFLINE_QUEUE_KEY = "offline_sales_queue";
const PRODUCTS_CACHE_KEY = "offline_products_cache";
const CUSTOMERS_CACHE_KEY = "offline_customers_cache";

interface QueuedSale {
  id: string;
  timestamp: number;
  payload: any;
  items: any[];
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueLength, setQueueLength] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  // Update online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Back online! Syncing data...");
      syncQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("You're offline. Sales will be saved locally and synced when back online.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Load queue length
  useEffect(() => {
    const queue = getQueue();
    setQueueLength(queue.length);
  }, []);

  // Cache products and customers for offline use
  const cacheDataForOffline = useCallback(async () => {
    try {
      const [{ data: products }, { data: customers }] = await Promise.all([
        supabase.from("products").select("id, name, selling_price, quantity, sku"),
        supabase.from("contacts").select("id, name, phone, current_balance").eq("type", "customer"),
      ]);
      if (products) localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(products));
      if (customers) localStorage.setItem(CUSTOMERS_CACHE_KEY, JSON.stringify(customers));
    } catch (e) {
      console.error("Failed to cache offline data:", e);
    }
  }, []);

  useEffect(() => {
    if (isOnline) cacheDataForOffline();
  }, [isOnline, cacheDataForOffline]);

  const getCachedProducts = () => {
    try {
      return JSON.parse(localStorage.getItem(PRODUCTS_CACHE_KEY) || "[]");
    } catch { return []; }
  };

  const getCachedCustomers = () => {
    try {
      return JSON.parse(localStorage.getItem(CUSTOMERS_CACHE_KEY) || "[]");
    } catch { return []; }
  };

  const getQueue = (): QueuedSale[] => {
    try {
      return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
    } catch { return []; }
  };

  const addToQueue = (sale: Omit<QueuedSale, "id" | "timestamp">) => {
    const queue = getQueue();
    const entry: QueuedSale = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...sale,
    };
    queue.push(entry);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    setQueueLength(queue.length);
    toast.info("Sale saved offline. Will sync when back online.");
  };

  const syncQueue = useCallback(async () => {
    if (syncingRef.current) return;
    const queue = getQueue();
    if (queue.length === 0) return;

    syncingRef.current = true;
    setSyncing(true);
    let synced = 0;
    const failed: QueuedSale[] = [];

    for (const entry of queue) {
      try {
        // Insert sale transaction
        const { data: saleData, error: saleError } = await supabase
          .from("sale_transactions")
          .insert(entry.payload)
          .select("id")
          .single();

        if (saleError) throw saleError;

        // Insert sale items
        if (entry.items && entry.items.length > 0) {
          const items = entry.items.map((item: any) => ({
            ...item,
            sale_id: saleData.id,
          }));
          await supabase.from("sale_items").insert(items);
        }

        // Update stock
        for (const item of entry.items || []) {
          if (item.product_id) {
            const { data: product } = await supabase
              .from("products")
              .select("quantity")
              .eq("id", item.product_id)
              .single();
            if (product) {
              await supabase
                .from("products")
                .update({ quantity: Math.max(0, (product.quantity || 0) - item.quantity) })
                .eq("id", item.product_id);
            }
          }
        }

        synced++;
      } catch (err) {
        console.error("Failed to sync sale:", err);
        failed.push(entry);
      }
    }

    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(failed));
    setQueueLength(failed.length);
    syncingRef.current = false;
    setSyncing(false);

    if (synced > 0) toast.success(`Synced ${synced} offline sale(s)`);
    if (failed.length > 0) toast.error(`${failed.length} sale(s) failed to sync`);
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline) syncQueue();
  }, [isOnline, syncQueue]);

  return {
    isOnline,
    queueLength,
    syncing,
    addToQueue,
    syncQueue,
    getCachedProducts,
    getCachedCustomers,
    cacheDataForOffline,
  };
}
