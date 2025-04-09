import axios from 'axios';
import {
  QueryClient,
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

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

export async function uploadCSV(file: File): Promise<UploadCSVResponse> {
  // Create FormData object to handle file upload
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    // Make the POST request with form data
    const response = await api.post('/transactions/upload/', formData, {
      headers: {
        // Override default Content-Type to handle multipart/form-data
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
    const ordering = `${sort.order === 'desc' ? '-' : ''}${sort.column}`;
    queryParams.append('ordering', ordering);
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
  flag_type: string;
  message: string;
  duplicates_transaction: number | null;
}

export type TransactionSortColumn = 'description' | 'amount' | 'datetime' | 'created_at' | 'updated_at';

export interface TransactionSort {
  column: TransactionSortColumn
  order: 'asc' | 'desc'
}

export interface QueryRule {
  description_words: string[],
  quantity_value?: number,
  quantity_compare?: '<' | '>' | '=',
}

export interface TransactionRule {
  id?: number;
  filter_description?: string;
  filter_amount_value?: string;
  filter_amount_comparison?: 'above' | 'below' | 'equal' | '';
  category?: string;
  flag_message?: string;
  created_at?: string;
  updated_at?: string;
}

export async function createTransactionRule(rule: TransactionRule): Promise<TransactionRule> {
  const response = await api.post('/rules/', rule);
  return response.data;
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

export async function applyRuleToAll(ruleId: number): Promise<RuleApplyResponse> {
  const response = await api.post(`/rules/${ruleId}/apply_to_all/`);
  return response.data;
}

export async function applyAllRules(): Promise<RuleApplyResponse> {
  const response = await api.post('/rules/apply_all_rules/');
  return response.data;
}
