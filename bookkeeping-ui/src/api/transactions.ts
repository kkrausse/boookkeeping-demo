import axios from 'axios';

const api = axios.create({
  baseURL: '/api', //import.meta.env.VITE_API_URL, // Loaded from .env
  headers: {
    'Content-Type': 'application/json',
  },
});

export async function uploadCSV(file: File): Promise<any> {
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

export const deleteTransaction = async (args: {transaction_id: number}) => {
  console.log('to delete!', args);
  await new Promise((r) => setTimeout(r, 1000));
};

export async function updateTransaction(transaction: Partial<Transaction> & { id: number }): Promise<Transaction> {
  // DRF ModelViewSet supports PUT requests by default even with commented update method
  const response = await api.put(`/transactions/${transaction.id}/`, transaction);
  return response.data;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface FetchTransactionsParams {
  page?: number;
  pageSize?: number;
  sort?: TransactionSort;
}

export async function fetchTransactions(params: FetchTransactionsParams = {}): Promise<{ data: PaginatedResponse<Transaction> }> {
  const { page = 1, pageSize = 10, sort } = params;
  
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
  
  const url = `/transactions/?${queryParams.toString()}`;
  let response = await api.get(url);
  return response;
}

export const TRANSACTION_KEYS = {
  all: ['all-transactions'],
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
