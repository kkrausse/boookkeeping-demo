import axios from 'axios';
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  QueryClient,
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

/**
 * Custom hook that creates an interval timer to repeatedly call a function
 * @param callback Function to call on each interval tick
 * @param defaultInterval Default interval in milliseconds
 * @returns [startPolling, stopPolling] functions
 */
export function usePollingEffect(callback: () => void, defaultInterval = 1000) {
  // Use ref to store interval ID for cleanup
  const intervalRef = useRef<number | null>(null);
  
  // Function to start the polling
  const startPolling = useCallback((interval = defaultInterval) => {
    console.log("Starting polling loop");
    
    // Clean up any existing interval first
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
    }
    
    // Set up a new interval
    const newIntervalId = window.setInterval(() => {
      console.log("Polling tick...");
      callback();
    }, interval);
    
    // Store the interval ID
    intervalRef.current = newIntervalId;
    
    // Return a function to stop polling
    return () => stopPolling();
  }, [callback, defaultInterval]);
  
  // Function to stop the polling
  const stopPolling = useCallback(() => {
    console.log("Stopping polling loop");
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, []);
  
  return [startPolling, stopPolling];
}

const api = axios.create({
  baseURL: '/api', //import.meta.env.VITE_API_URL, // Loaded from .env
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface UploadCSVResponse {
  created: Transaction[];
  created_count: number;
  warnings?: string[] | null;
  errors?: string[] | null;
  error?: string;
}

// Basic CSV upload function - for backward compatibility
// Note: We've moved most of this logic to the useCSVUpload hook
export async function uploadCSV(file: File): Promise<UploadCSVResponse> {
  // Create FormData object to handle file upload
  const formData = new FormData();
  formData.append('file', file);
  
  // Make the POST request with form data
  const response = await api.post('/transactions/upload/', formData, {
    headers: {
      // Override default Content-Type to handle multipart/form-data
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data;
}

export async function deleteTransaction(id: number): Promise<void> {
  // Delete the transaction using the API
  await api.delete(`/transactions/${id}/`);
};

export async function createTransaction(transaction: Partial<Transaction>): Promise<Transaction> {
  // Create a new transaction
  const response = await api.post('/transactions/', transaction);
  return response.data;
}

// Centralized update function that handles API call and optimistic updates
export async function updateTransaction(transaction: Partial<Transaction> & { id: number }): Promise<Transaction> {
  // DRF ModelViewSet supports PUT requests by default even with commented update method
  const response = await api.put(`/transactions/${transaction.id}/`, transaction);
  return response.data;
}

// Helper function for using React Query to update a transaction with optimistic updates
export function useTransactionUpdate() {
  const queryClient = useQueryClient();
  
  return {
    updateTransaction: async (
      transaction: Partial<Transaction> & { id: number },
      options?: {
        onSuccess?: (data: Transaction) => void;
        onError?: (error: Error) => void;
      }
    ) => {
      // Store the previous data for rollback if needed
      const previousData = queryClient.getQueryData<PaginatedResponse<Transaction>>(
        TRANSACTION_KEYS.all
      );
      
      // Optimistically update the cache
      if (previousData) {
        queryClient.setQueryData<PaginatedResponse<Transaction>>(
          TRANSACTION_KEYS.all,
          oldData => {
            if (!oldData) return oldData;
            
            return {
              ...oldData,
              results: oldData.results.map(tx => 
                tx.id === transaction.id ? { ...tx, ...transaction } : tx
              )
            };
          }
        );
        
        // Also update any paginated queries
        const paginatedQueries = queryClient.getQueriesData<PaginatedResponse<Transaction>>({
          queryKey: ['transactions', 'paginated']
        });
        
        paginatedQueries.forEach(([queryKey, data]) => {
          if (data) {
            queryClient.setQueryData(queryKey, {
              ...data,
              results: data.results.map(tx => 
                tx.id === transaction.id ? { ...tx, ...transaction } : tx
              )
            });
          }
        });
      }
      
      try {
        // Make the API call
        const result = await updateTransaction(transaction);
        
        // Invalidate queries to ensure data consistency
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        
        // Call success callback if provided
        if (options?.onSuccess) {
          options.onSuccess(result);
        }
        
        return result;
      } catch (error) {
        // Rollback on error (revert optimistic update)
        if (previousData) {
          queryClient.setQueryData(TRANSACTION_KEYS.all, previousData);
          
          // Revert paginated queries too
          const paginatedQueries = queryClient.getQueriesData({
            queryKey: ['transactions', 'paginated']
          });
          
          paginatedQueries.forEach(([queryKey]) => {
            queryClient.invalidateQueries({ queryKey: queryKey as any });
          });
        }
        
        // Call error callback if provided
        if (options?.onError && error instanceof Error) {
          options.onError(error);
        }
        
        throw error;
      }
    }
  };
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface FilterParams {
  description?: string;
  amountValue?: string;
  amountComparison?: 'above' | 'below' | 'equal' | '';
}

export interface FetchTransactionsParams {
  page?: number;
  pageSize?: number;
  sort?: TransactionSort;
  filters?: FilterParams;
}

export async function fetchTransactions(params: FetchTransactionsParams = {}): Promise<{ data: PaginatedResponse<Transaction> }> {
  const { page = 1, pageSize = 10, sort, filters } = params;
  
  // Build query parameters
  const queryParams = new URLSearchParams();
  queryParams.append('page', page.toString());
  
  if (pageSize) {
    queryParams.append('page_size', pageSize.toString());
  }
  
  // Add sorting if provided
  if (sort) {
    // Special case for flags sorting (sort by flag count)
    if (sort.column === 'flags') {
      // Use the flag count annotation from the Django backend
      const ordering = `${sort.order === 'desc' ? '-' : ''}flag_count`;
      queryParams.append('ordering', ordering);
    } else {
      const ordering = `${sort.order === 'desc' ? '-' : ''}${sort.column}`;
      queryParams.append('ordering', ordering);
    }
  }
  
  // Add filters if provided
  if (filters) {
    // Description filter (case insensitive)
    if (filters.description) {
      queryParams.append('description__icontains', filters.description);
    }
    
    // Amount comparison filter
    if (filters.amountValue && filters.amountComparison) {
      const amountValue = filters.amountValue;
      
      switch (filters.amountComparison) {
        case 'above':
          queryParams.append('amount__gt', amountValue);
          break;
        case 'below':
          queryParams.append('amount__lt', amountValue);
          break;
        case 'equal':
          queryParams.append('amount', amountValue);
          break;
      }
    }
  }
  
  const url = `/transactions/?${queryParams.toString()}`;
  let response = await api.get(url);
  return response;
}

export const TRANSACTION_KEYS = {
  all: ['transactions'],
  paginated: (params: FetchTransactionsParams) => ['transactions', 'paginated', params]
}


export interface Transaction {
  id: number;
  description: string;
  category: string;
  amount: string; // Django DecimalField returns string in JSON
  datetime: string;
  created_at: string;
  updated_at: string;
  flags: TransactionFlag[];
}

export interface TransactionFlag {
  id?: number; // We need the ID to resolve the flag
  flag_type: string;
  message: string;
  duplicates_transaction: number | null;
  is_resolvable: boolean;
}

export type TransactionSortColumn = 'description' | 'amount' | 'datetime' | 'created_at' | 'updated_at' | 'flags';

export interface TransactionSort {
  column: TransactionSortColumn
  order: 'asc' | 'desc'
}

export interface QueryRule {
  description_words: string[],
  quantity_value?: number,
  quantity_compare?: '<' | '>' | '=',
}

export interface FilterCondition {
  // String filters
  description__icontains?: string;
  description__contains?: string;
  description?: string;
  
  // Amount filters
  amount__gt?: number;
  amount__lt?: number;
  amount__gte?: number;
  amount__lte?: number;
  amount?: number;
  
  // Category filters
  category__icontains?: string;
  category__contains?: string;
  category?: string;
  
  // Date filters
  datetime__gt?: string;
  datetime__lt?: string;
  datetime?: string;
}

export interface TransactionRule {
  id?: number;
  filter_condition?: FilterCondition;
  category?: string;
  flag_message?: string;
  created_at?: string;
  updated_at?: string;
  
  // Legacy fields - to be removed
  filter_description?: string;
  filter_amount_value?: string;
  filter_amount_comparison?: 'above' | 'below' | 'equal' | '';
}

export interface CreateRuleParams {
  rule: TransactionRule;
  applyToAll?: boolean;
}

// Hook for creating a rule with optional apply-to-all with real-time updates
export function useCreateTransactionRule(options: { pollingInterval?: number } = {}) {
  const queryClient = useQueryClient();
  const { pollingInterval = 1000 } = options;
  
  // Use our generic polling hook
  const [startPolling, stopPolling] = usePollingEffect(
    () => queryClient.invalidateQueries({queryKey: ['transactions']}),
    pollingInterval
  );
  
  return useMutation<TransactionRule, Error, CreateRuleParams>({
    mutationFn: async (params: CreateRuleParams) => {
      try {
        // First create the rule
        const response = await api.post('/rules/', params.rule);
        const createdRule = response.data;
        
        // If applyToAll is true, apply the rule to all transactions
        // This is where the long-running operation happens
        if (params.applyToAll && createdRule.id) {
          // Start polling for updates at this point
          startPolling();
          setLongOperationInProgress(true);
          
          try {
            await api.post(`/rules/${createdRule.id}/apply_to_all/`);
          } finally {
            stopPolling();
            setLongOperationInProgress(false);
          }
        }
        
        return createdRule;
      } catch (error) {
        // Make sure we stop polling if there's an error
        stopPolling();
        setLongOperationInProgress(false);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['rules']});
      queryClient.invalidateQueries({queryKey: ['transactions']});
    }
  });
}

// Original function kept for backward compatibility
export async function createTransactionRule(params: CreateRuleParams): Promise<TransactionRule> {
  // First create the rule
  const response = await api.post('/rules/', params.rule);
  const createdRule = response.data;
  
  // If applyToAll is true, apply the rule to all transactions
  // Note: We don't need to set the long operation flag here since applyRuleToAll already does it
  if (params.applyToAll && createdRule.id) {
    await applyRuleToAll(createdRule.id);
  }
  
  return createdRule;
}

export async function fetchTransactionRules(): Promise<{ data: PaginatedResponse<TransactionRule> }> {
  const response = await api.get('/rules/');
  return response;
}

export async function deleteTransactionRule(id: number): Promise<void> {
  await api.delete(`/rules/${id}/`);
}

export async function updateTransactionRule(rule: TransactionRule & { id: number }): Promise<TransactionRule> {
  const response = await api.put(`/rules/${rule.id}/`, rule);
  return response.data;
}

export interface RuleApplyResponse {
  rule_id?: number;
  updated_count: number;
}

// Hook for applying a rule to all transactions with real-time updates
export function useApplyRuleToAll(options: { pollingInterval?: number } = {}) {
  const queryClient = useQueryClient();
  const { pollingInterval = 1000 } = options;
  
  // Use our generic polling hook
  const [startPolling, stopPolling] = usePollingEffect(
    () => queryClient.invalidateQueries({queryKey: ['transactions']}),
    pollingInterval
  );
  
  return useMutation<RuleApplyResponse, Error, number>({
    mutationFn: async (ruleId: number) => {
      try {
        const response = await api.post(`/rules/${ruleId}/apply_to_all/`);
        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          return error.response.data;
        }
        throw error;
      }
    },
    onMutate: () => {
      startPolling();
      setLongOperationInProgress(true);
    },
    onSettled: () => {
      stopPolling();
      setLongOperationInProgress(false);
      queryClient.invalidateQueries({queryKey: ['transactions']});
    }
  });
}

// Hook for applying all rules with real-time updates
export function useApplyAllRules(options: { pollingInterval?: number } = {}) {
  const queryClient = useQueryClient();
  const { pollingInterval = 1000 } = options;
  
  // Use our generic polling hook
  const [startPolling, stopPolling] = usePollingEffect(
    () => queryClient.invalidateQueries({queryKey: ['transactions']}),
    pollingInterval
  );
  
  return useMutation<RuleApplyResponse, Error, void>({
    mutationFn: async () => {
      try {
        const response = await api.post('/rules/apply_all_rules/');
        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          return error.response.data;
        }
        throw error;
      }
    },
    onMutate: () => {
      startPolling();
      setLongOperationInProgress(true);
    },
    onSettled: () => {
      stopPolling();
      setLongOperationInProgress(false);
      queryClient.invalidateQueries({queryKey: ['transactions']});
    }
  });
}

// Original functions kept for backward compatibility
export async function applyRuleToAll(ruleId: number): Promise<RuleApplyResponse> {
  try {
    setLongOperationInProgress(true);
    const response = await api.post(`/rules/${ruleId}/apply_to_all/`);
    return response.data;
  } finally {
    setLongOperationInProgress(false);
  }
}

export async function applyAllRules(): Promise<RuleApplyResponse> {
  try {
    setLongOperationInProgress(true);
    const response = await api.post('/rules/apply_all_rules/');
    return response.data;
  } finally {
    setLongOperationInProgress(false);
  }
}

// Direct API call function for resolving flags
export async function resolveTransactionFlag(transactionId: number, flagId: number): Promise<any> {
  const response = await api.post(`/transactions/${transactionId}/resolve-flag/${flagId}/`);
  return response.data;
}

// Hook for using TanStack Query to resolve flags
export function useResolveTransactionFlag() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ transactionId, flagId }: { transactionId: number, flagId: number }) => 
      resolveTransactionFlag(transactionId, flagId),
    
    onSuccess: (_, variables) => {
      // Invalidate the specific transaction
      queryClient.invalidateQueries({
        queryKey: ['transactions', variables.transactionId]
      });
      
      // Also invalidate all transactions queries to update lists
      queryClient.invalidateQueries({
        queryKey: ['transactions']
      });
    }
  });
}

// Hook for using React Query to update a transaction with optimistic updates
export function useTransactionUpdateMutation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (update: Partial<Transaction> & { id: number }) => {
      const old = queryClient.getQueryData<PaginatedResponse<Transaction>>(
        TRANSACTION_KEYS.all
      )?.results.find(t => t.id === update.id);
      
      return updateTransaction({ ...old, ...update });
    },
    onMutate: async (updatedTransaction) => {
      // Snapshot the previous value
      const previousData = queryClient.getQueryData<PaginatedResponse<Transaction>>(
        TRANSACTION_KEYS.paginated({})
      );

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: TRANSACTION_KEYS.paginated({}) });
      
      // Optimistically update the cache
      if (previousData) {
        queryClient.setQueryData<PaginatedResponse<Transaction>>(
          TRANSACTION_KEYS.paginated({}),
          old => {
            if (!old) return old;
            return {
              ...old,
              results: old.results.map(tx => 
                tx.id === updatedTransaction.id ? { ...tx, ...updatedTransaction } : tx
              )
            };
          }
        );
        
        // Also update any paginated queries
        const paginatedQueries = queryClient.getQueriesData<PaginatedResponse<Transaction>>({
          queryKey: ['transactions', 'paginated']
        });
        
        paginatedQueries.forEach(([queryKey, data]) => {
          if (data) {
            queryClient.setQueryData(queryKey, {
              ...data,
              results: data.results.map(tx => 
                tx.id === updatedTransaction.id ? { ...tx, ...updatedTransaction } : tx
              )
            });
          }
        });
      }
      
      return { previousData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (error, _, context) => {
      // Roll back to the previous value if there was an error
      if (context?.previousData) {
        queryClient.setQueryData(
          TRANSACTION_KEYS.paginated({}), 
          context.previousData
        );
        
        // Revert paginated queries too
        const paginatedQueries = queryClient.getQueriesData({
          queryKey: ['transactions', 'paginated']
        });
        
        paginatedQueries.forEach(([queryKey]) => {
          queryClient.invalidateQueries({ queryKey: queryKey as any });
        });
      }
    }
  });
}

// Hook for CSV upload with react-query and real-time updates
export interface CSVUploadOptions {
  onSuccess?: (data: UploadCSVResponse) => void;
  onError?: (error: Error) => void;
  onMutate?: () => void;
  pollingInterval?: number; // Polling interval in ms, defaults to 1000ms
}

export function useCSVUpload(options: CSVUploadOptions = {}) {
  const queryClient = useQueryClient();
  const { pollingInterval = 1000 } = options;
  
  // Use our generic polling hook to create start/stop functions
  const [startPolling, stopPolling] = usePollingEffect(
    // The function to call on each interval
    () => queryClient.invalidateQueries({queryKey: ['transactions']}),
    // The polling interval
    pollingInterval
  );

  return useMutation<UploadCSVResponse, Error, File>({
    mutationFn: async (file) => {
      try {
        // We're not using the setLongOperationInProgress flag in the uploadCSV function anymore
        // since we're managing that directly from here
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await api.post('/transactions/upload/', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          return error.response.data;
        }
        throw error;
      }
    },
    onMutate: () => {
      // Start the interval to invalidate queries periodically
      startPolling();
      
      // Set the global long operation flag (still using this for backward compatibility)
      setLongOperationInProgress(true);
      
      // Call the onMutate callback if provided
      if (options.onMutate) {
        options.onMutate();
      }
    },
    onSuccess: (data) => {
      // Final invalidation to ensure we have the latest data
      queryClient.invalidateQueries({queryKey: ['transactions']});
      
      // Call the success callback if provided
      if (options.onSuccess) {
        options.onSuccess(data);
      }
    },
    onError: (error) => {
      // Call the error callback if provided
      if (options.onError) {
        options.onError(error);
      }
    },
    onSettled: () => {
      // Always stop the invalidation loop and clear long operation flag when done
      stopPolling();
      setLongOperationInProgress(false);
    }
  });
}

// Global flag to track long-running operations
let isLongOperationInProgress = false;

// Functions to control the long-running operation state
export function setLongOperationInProgress(value: boolean) {
  isLongOperationInProgress = value;
}

export function isLongOperationActive() {
  return isLongOperationInProgress;
}

// Hook for fetching transactions with pagination and filtering
export function useTransactions(params: FetchTransactionsParams = {}) {
  return useQuery<PaginatedResponse<Transaction>, Error>({
    queryKey: TRANSACTION_KEYS.paginated(params),
    queryFn: () => fetchTransactions(params).then(r => r.data),
    placeholderData: keepPreviousData,
  });
}
