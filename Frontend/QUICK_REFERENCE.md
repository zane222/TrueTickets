# TypeScript API Types - Quick Reference Card (React 19 / Vite 7)

## 🚀 Import Types

```typescript
import { LargeTicket, Customer, PostTicket, PostComment } from './types/api';
```

## 📋 Common Types

### Customer
```typescript
interface Customer {
  id: number;
  firstname?: string;
  lastname?: string;
  fullname?: string;
  business_name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}
```

### LargeTicket (Full Ticket)
```typescript
interface LargeTicket {
  id: number;
  number: number;
  subject?: string;
  status?: string;
  customer_id?: number;
  created_at?: string;
  due_date?: string;
  properties?: TicketProperties;
  comments?: Comment[];
  customer?: Customer;
  user?: User;
  ticket_type_id?: number;
}
```

### SmallTicket (List View)
```typescript
interface SmallTicket {
  id: number;
  number: number;
  subject?: string;
  status?: string;
  customer_id?: number;
  customer_business_then_name?: string;
  properties?: TicketProperties;
  user?: User;
}
```

### TicketProperties
```typescript
interface TicketProperties {
  Password?: string;                                    // Computer password (9818, 9836)
  "Password (type \"none\" if no password)"?: string;   // Phone password (9801)
  Model?: string;
  "AC Charger"?: string;                                // "1" or "0"
  "Tech Notes"?: string;
  "IMEI or S/N"?: string;
  "Ever Been Wet"?: string;                             // "1" or "0"
  "Previous Damage or Issues"?: string;
  "Current Issue:"?: string;
}
```

### Comment
```typescript
interface Comment {
  id: number;
  body?: string;
  tech?: string;
  hidden?: boolean;    // true = internal, false = customer visible
  created_at?: string;
}
```

## 📤 Creating Data (POST)

### Create Customer
```typescript
const newCustomer: PostCustomer = {
  firstname: "John",
  lastname: "Doe",
  business_name: "Doe's Shop",
  mobile: "555-1234",
  get_sms: true,
};
await api.post('/customers', newCustomer);
```

### Create Ticket
```typescript
const newTicket: PostTicket = {
  customer_id: 12345,
  subject: "iPhone 12 Screen Repair",
  status: "New",
  ticket_type_id: 9818,
  properties: {
    Password: "1234",
    "AC Charger": "1",
  },
};
await api.post('/tickets', newTicket);
```

### Add Comment (Internal)
```typescript
const comment: PostComment = {
  subject: "Update",
  body: "Started repair",
  tech: "Tech Name",
  hidden: true,
  do_not_email: true,
};
await api.post(`/tickets/${ticketId}/comment`, comment);
```

### Add SMS Comment
```typescript
const sms: PostComment = {
  subject: "SMS",
  body: "Your device is ready!",
  sms_body: "Your device is ready!",
  tech: "Tech Name",
  hidden: false,        // SMS = not hidden
  do_not_email: false,
};
await api.post(`/tickets/${ticketId}/comment`, sms);
```

## 📥 Fetching Data (GET)

### Get Single Ticket
```typescript
const response: OneLargeTicket = await api.get(`/tickets/${ticketId}`);
const ticket: LargeTicket = response.ticket;
```

### Get Ticket List
```typescript
const response: Tickets = await api.get('/tickets?status=In Progress');
const tickets: Ticket[] = response.tickets;
```

### Get Single Customer
```typescript
const response: OneCustomer = await api.get(`/customers/${customerId}`);
const customer: Customer = response.customer;
```

### Get Customer List
```typescript
const response: Customers = await api.get('/customers?page=1');
const customers: Customer[] = response.customers;
```

## ✏️ Updating Data (PUT)

### Update Ticket
```typescript
const updates: Partial<LargeTicket> = {
  status: "Ready",
  subject: "Updated Subject",
};
await api.put(`/tickets/${ticketId}`, { ticket: updates });
```

### Update Customer
```typescript
const updates: Partial<Customer> = {
  mobile: "555-9999",
  email: "newemail@example.com",
};
await api.put(`/customers/${customerId}`, { customer: updates });
```

## 🔑 Password by Ticket Type

```typescript
function getPassword(ticket: LargeTicket): string {
  const typeId = ticket.ticket_type_id;
  
  // Computer/Tablet (9818, 9836)
  if (typeId === 9818 || typeId === 9836) {
    return ticket.properties?.Password || "";
  }
  
  // Phone (9801)
  if (typeId === 9801) {
    return ticket.properties?.["Password (type \"none\" if no password)"] || "";
  }
  
  return "";
}
```

## 📱 React Component Example

```typescript
import { LargeTicket, Customer } from './types/api';

interface Props {
  ticket: LargeTicket;
  onUpdate: (ticket: LargeTicket) => void;
}

function TicketCard({ ticket, onUpdate }: Props) {
  const customer: Customer | undefined = ticket.customer;
  const password = ticket.properties?.Password;
  
  return (
    <div>
      <h3>#{ticket.number}</h3>
      <p>{ticket.subject}</p>
      <p>Customer: {customer?.fullname}</p>
      <p>Status: {ticket.status}</p>
      {password && <p>Password: {password}</p>}
    </div>
  );
}
```

## 🎯 Common Patterns

### Typed State
```typescript
const [ticket, setTicket] = useState<LargeTicket | null>(null);
const [tickets, setTickets] = useState<SmallTicket[]>([]);
const [customer, setCustomer] = useState<Customer | null>(null);
```

### Typed Function
```typescript
async function fetchTicket(id: number): Promise<LargeTicket> {
  const response: OneLargeTicket = await api.get(`/tickets/${id}`);
  return response.ticket;
}
```

### Optional Chaining
```typescript
const name = ticket.customer?.fullname;
const password = ticket.properties?.Password;
const firstComment = ticket.comments?.[0]?.body;
```

### Array Operations
```typescript
// Filter
const active = tickets.filter((t: SmallTicket) => t.status !== "Resolved");

// Map
const numbers = tickets.map((t: SmallTicket) => t.number);

// Sort
const sorted = [...tickets].sort((a, b) => b.number - a.number);
```

## 📚 Ticket Type IDs

| ID | Type | Password Field |
|----|------|----------------|
| 9818 | Computer/Tablet | `Password` |
| 9836 | Computer/Tablet | `Password` |
| 9801 | Phone | `"Password (type \"none\" if no password)"` |

## ⚠️ Important Notes

1. **Always use optional chaining** for nested properties:
   ```typescript
   ticket.customer?.fullname  // ✅ Good
   ticket.customer.fullname   // ❌ Can crash if customer is undefined
   ```

2. **AC Charger is a string**, not boolean:
   ```typescript
   "AC Charger": "1"  // ✅ Has charger
   "AC Charger": "0"  // ✅ No charger
   ```

3. **Ever Been Wet is a string**, not boolean:
   ```typescript
   "Ever Been Wet": "1"  // ✅ Yes
   "Ever Been Wet": "0"  // ✅ No
   ```

4. **Hidden comments**:
   - `hidden: true` = Internal note (not visible to customer)
   - `hidden: false` = Customer visible (SMS)

5. **Dates are strings** in ISO format:
   ```typescript
   created_at: "2024-01-15T10:30:00Z"
   ```

## 🔗 More Help

- **Full API Guide**: See `API_TYPES_GUIDE.md`
- **TypeScript Basics**: See `TYPESCRIPT_QUICK_START.md`
- **All Types**: See `src/types/api.ts`

## 💡 Pro Tips

```typescript
// Type a complex API call
async function updateTicketStatus(
  ticketId: number,
  newStatus: string
): Promise<LargeTicket> {
  const updates: Partial<LargeTicket> = { status: newStatus };
  const response: OneLargeTicket = await api.put(
    `/tickets/${ticketId}`,
    { ticket: updates }
  );
  return response.ticket;
}

// Type a custom hook
function useTicket(id: number) {
  const [ticket, setTicket] = useState<LargeTicket | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    api.get(`/tickets/${id}`)
      .then((res: OneLargeTicket) => setTicket(res.ticket))
      .finally(() => setLoading(false));
  }, [id]);
  
  return { ticket, loading };
}
```

---

**Need more examples?** Check out `API_TYPES_GUIDE.md` for comprehensive usage patterns!