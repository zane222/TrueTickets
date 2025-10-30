using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;

namespace RepairShopRObjects {

    [Serializable]
    public class PostTicket { // OneLargeTicket = Post(Main.URL + "/tickets", PostTicket) // only when creating a new ticket, updating is different

        public int customer_id, user_id = 0, ticket_type_id = 9818;

        public string subject, problem_type = "Other", status = "New";

        public DateTime due_date;

        public TicketProperties properties = new TicketProperties();

        public PostTicket(string brand, string model, string color, string device, bool doesTicketNeedDevice, string[] problems, string[] doItIf, string[] prices, string otherDetails, int customer_id, DateTime due_date, DateTime creationDate, string howLong, string password, bool ACCharger, string[] itemsLeft, string needData, bool callBy) {
            TicketDetailsV1 ticketDetails = new TicketDetailsV1(brand, model, color, device, problems, doItIf, prices, otherDetails, howLong, itemsLeft, needData);
            subject = ticketDetails.Subject(creationDate, due_date, doesTicketNeedDevice);
            properties.SetACCharger(ACCharger);
            this.customer_id = customer_id;
            this.due_date = due_date;
            properties.Password = password != "" ? password : "n";
            properties.techNotes = "v1" + JsonConvert.SerializeObject(ticketDetails, Formatting.Indented);
        }

        public PostTicket(string subject, int customer_id, string password, bool ACCharger) {
            properties.SetACCharger(ACCharger);
            this.subject = subject;
            this.customer_id = customer_id;
            properties.Password = password != "" ? password : "n";
        }

    }

    [Serializable]
    public class TicketDetailsV1 {

        public string brand, model, color, device, needData, otherDetails, howLong;

        public string[] problems, doItIf, prices, itemsLeft;

        public TicketDetailsV1(string brand, string model, string color, string device, string[] problems, string[] doItIf, string[] prices, string otherDetails, string howLong, string[] itemsLeft, string needData) {
            this.brand = brand;
            this.model = model;
            this.color = color;
            this.device = device;
            this.problems = problems;
            this.doItIf = doItIf;
            this.prices = prices;
            this.otherDetails = otherDetails;
            this.howLong = howLong;
            this.itemsLeft = itemsLeft;
            this.needData = needData;
        }

        public TicketDetailsV1() {
            doItIf = Enumerable.Repeat("", 25).ToArray();
        }

        public string Subject(DateTime creationDate, DateTime dueDate, bool doesTicketNeedDevice) {
            string text = " " + brand + " " + 
                model + " " +
                color + " " +
                (doesTicketNeedDevice ? device : "") + " " +
                CombineProblemsDoItIfsAndPrices()
                + " " +
                CombineOtherDetailsDueDateAndNeedData(creationDate, dueDate);
            return text.Replace("​", "").Replace("   ", " ").Replace("  ", " ").Replace(", , ", ", ").Replace("(, ", "(").Replace(", )", ")").Replace("Laptop", "Ltop").Replace("Desktop", "Dtop").Replace("All in one", "AIO").Replace(" iPhone ", " iPh ").Trim();
        }

        string CombineProblemsDoItIfsAndPrices() {
            string combined = "";
            for(int i = 0; i < problems.Length; i++) {
                combined += problems[i];
                if(doItIf[i] != "") combined += ", do it if " + doItIf[i];
                combined += " " + prices[i];
                if(i != problems.Length - 1) combined += " + ";
            }
            return combined;
        }

        string CombineOtherDetailsDueDateAndNeedData(DateTime creationDate, DateTime dueDate) {
            if(otherDetails.Length == 0 && (howLong == "" && UsefullMethods.DueDateFormatedToString(dueDate, creationDate) == "") && needData == "") return "";
            string s = otherDetails + ", " + needData + ", ";
            if(howLong != "" || UsefullMethods.DueDateFormatedToString(dueDate, creationDate) != "") {
                if(string.Join(", ", prices).ToLower().Contains("ckcl")) {
                    s += "Check by: ";
                } else {
                    s += "Ready by: ";
                }
                if(UsefullMethods.DueDateFormatedToString(dueDate, creationDate) != "") {
                    s += UsefullMethods.DueDateFormatedToString(dueDate, creationDate);
                } else {
                    s += howLong;
                }
            }
            return " (" + s + ")";
        }

    }

    [Serializable]
    public class SmallTickets { // SmallTickets = Get(Main.URL + "/tickets?number={number}")

        public SmallTicket[] tickets;

        public Meta meta;

        public SmallTickets(List<SmallTickets> list) {
            List<SmallTicket> l = new List<SmallTicket>();
            for(int i = 0; i < list.Count; i++) {
                for(int ii = 0; ii < list[i].tickets.Length; ii++) {
                    l.Add(list[i].tickets[ii]);
                }
            }
            l.Sort();
            tickets = l.ToArray();
        }

        public SmallTickets() { }

    }

    [Serializable]
    public class OneLargeTicket { // OneLargeTicket = Get(Main.URL + "/tickets/{ticket_id}")

        public LargeTicket ticket;

    }

    [Serializable]
    public class PostComment { // Post(Main.URL + "/tickets/" + ticketBeingViewed.id + "/comment", PostComment)

        public string subject, body, sms_body, tech;

        public bool hidden = true, do_not_email = true;

        public PostComment(string body, string technician) {
            if(technician != "Other") tech = technician;
            else tech = "Cacell System";
            subject = "Update";
            this.body = body;
        }

        public PostComment MakeItSms() {
            hidden = false;
            sms_body = body;
            do_not_email = false;
            return this;
        }

    }

    [Serializable]
    public class Meta {

        public int total_pages, total_entries, per_page, page;

    }

    [Serializable]
    public class PostCustomer { // OneCustomer = Post(Main.URL + "/customers", ThisCustomer) // only when making a new customer, updating is different

        public string business_name, firstname, lastname, phone, mobile, notes;

        public bool get_sms = false;

        public PostCustomer(string firstname, string lastname, string businessName, string phone) {
            this.firstname = firstname;
            this.lastname = lastname;
            business_name = businessName;
            mobile = phone;
        }

    }

    [Serializable]
    public class Customers { // Customers = Get(Main.URL + "/customers?page={page_number}")

        public Customer[] customers;

        //public Meta meta;

    }

    [Serializable]
    public class OneCustomer { // OneCustomer = Get(Main.URL + "/customers/{customer_id}")

        public Customer customer;

    }

    [Serializable]
    public class ApiKey {

        public string key;

        public ApiKey(string key) {
            this.key = key;
        }

    }

    [Serializable]
    public class Answer {

        public int ticket_field_id;
        public string content;
        public DateTime created_at;
        public DateTime? updated_at;
        public int? account_id, id;

    }

    [Serializable]
    public class Asset {

        public int id;
        public string name;
        public int customer_id;
        public object contact_id;
        public DateTime created_at;
        public DateTime? updated_at;
        public AssetProperties properties;
        public string asset_type;
        public string asset_serial;
        public object external_rmm_link;
        public Customer customer;
        public object[] rmm_links;
        public bool? has_live_chat;
        public object snmp_enabled;
        public DeviceInfo device_info;
        public RmmStore rmm_store;
        public object address;

    }

    [Serializable]
    public class Attachment {

        public int id;
        public string file_name;
        public File file;
        public DateTime created_at;
        public DateTime? updated_at;
        public string attachable_type;
        public int? attachable_id;
        public int? account_id;
        public bool? @private;
        public string content_type;
        public int? file_size;
        public string md5;
        public object name;

        public string CreationTimeFormatedToString() {
            if(created_at == new DateTime()) return "";
            bool pm = false;
            string minute = created_at.Minute.ToString();
            string hour = created_at.Hour.ToString();
            if(created_at.Minute < 10) minute = "0" + minute;
            if(created_at.Hour > 12) {
                hour = (created_at.Hour - 12).ToString();
                pm = true;
            }
            if(hour == "0") hour = "12";
            return hour + ":" + minute + (pm ? " PM" : " AM");
        }

        public string CreationDateFormatedToString() {
            if(created_at == new DateTime()) return "";
            return created_at.Month + "/" + created_at.Day + "/" + created_at.Year;
        }

    }

    [Serializable]
    public class Comment {

        public int id;
        public DateTime created_at;
        public DateTime? updated_at;
        public int? ticket_id;
        public string subject;
        public string body;
        public string tech;
        public bool? hidden; //hidden means SMS (IDK why)
        public int? user_id;

        public bool IsSms() {
            return !(hidden ?? true);
        }

        public string CreationTimeFormatedToString() {
            if(created_at == new DateTime()) return "";
            bool pm = false;
            string minute = created_at.Minute.ToString();
            string hour = created_at.Hour.ToString();
            if(created_at.Minute < 10) minute = "0" + minute;
            if(created_at.Hour > 12) {
                hour = (created_at.Hour - 12).ToString();
                pm = true;
            }
            if(hour == "0") hour = "12";
            return hour + ":" + minute + (pm ? " PM" : " AM");
        }

        public string CreationDateFormatedToString() {
            if(created_at == new DateTime()) return "";
            return created_at.Month + "/" + created_at.Day + "/" + created_at.Year;
        }

    }

    [Serializable]
    public class Customer {

        public int id;
        public string firstname;
        public string lastname;
        public string fullname;
        public string business_name;
        public string email;
        public string phone;
        public string mobile;
        public DateTime created_at;
        public DateTime? updated_at;
        public string pdf_url;
        public string address;
        public string address_2;
        public string city;
        public string state;
        public string zip;
        public object latitude;
        public object longitude;
        public string notes;
        public bool? get_sms;
        public bool? opt_out;
        public bool? disabled;
        public bool? no_email;
        public object location_id;
        public CustomerProperties properties;
        public string online_profile_url;
        public object tax_rate_id;
        public string notification_email;
        public string invoice_cc_emails;
        public object invoice_term_id;
        public string referred_by;
        public object ref_customer_id;
        public string business_and_full_name;
        public string business_then_name;
        public object location_name;
        public object[] contacts;

        public Customer() { }

        public Customer(string firstName, string lastName, string businessName, string phone, Customer previousCustomer) {
            UsePreviousValues(previousCustomer);
            firstname = firstName;
            lastname = lastName;
            business_name = businessName;
            mobile = phone;
            this.phone = "";
        }

        void UsePreviousValues(Customer previousCustomer) {
            id = previousCustomer.id;
            firstname = previousCustomer.firstname;
            lastname = previousCustomer.lastname;
            fullname = previousCustomer.fullname;
            business_name = previousCustomer.business_name;
            email = previousCustomer.email;
            phone = previousCustomer.phone;
            mobile = previousCustomer.mobile;
            created_at = previousCustomer.created_at;
            updated_at = previousCustomer.updated_at;
            pdf_url = previousCustomer.pdf_url;
            address = previousCustomer.address;
            address_2 = previousCustomer.address_2;
            city = previousCustomer.city;
            state = previousCustomer.state;
            zip = previousCustomer.zip;
            latitude = previousCustomer.latitude;
            longitude = previousCustomer.longitude;
            notes = previousCustomer.notes;
            get_sms = previousCustomer.get_sms;
            opt_out = previousCustomer.opt_out;
            disabled = previousCustomer.disabled;
            no_email = previousCustomer.no_email;
            location_id = previousCustomer.location_id;
            properties = previousCustomer.properties;
            online_profile_url = previousCustomer.online_profile_url;
            tax_rate_id = previousCustomer.tax_rate_id;
            notification_email = previousCustomer.notification_email;
            invoice_cc_emails = previousCustomer.invoice_cc_emails;
            invoice_term_id = previousCustomer.invoice_term_id;
            referred_by = previousCustomer.referred_by;
            ref_customer_id = previousCustomer.ref_customer_id;
            business_and_full_name = previousCustomer.business_and_full_name;
            business_then_name = previousCustomer.business_then_name;
            location_name = previousCustomer.location_name;
            contacts = previousCustomer.contacts;
        }

        public string CreationDateFormatedToString() {
            if(created_at == new DateTime()) return "";
            return created_at.Month + "/" + created_at.Day + "/" + created_at.Year;
        }

        public string CreationTimeFormatedToString() {
            if(created_at == new DateTime()) return "";
            bool pm = false;
            string minute = created_at.Minute.ToString();
            string hour = created_at.Hour.ToString();
            if(created_at.Minute < 10) minute = "0" + minute;
            if(created_at.Hour > 12) {
                hour = (created_at.Hour - 12).ToString();
                pm = true;
            }
            if(hour == "0") hour = "12";
            return hour + ":" + minute + (pm ? " PM" : " AM");
        }

    }

    [Serializable]
    public class DeviceInfo {
        public SnmpConfig snmp_config;
    }

    [Serializable]
    public class Emsisoft { }

    [Serializable]
    public class File {
        public string url;
        public Thumb thumb;
        public Main main;
    }

    [Serializable]
    public class General { }

    [Serializable]
    public class Main {
        public string url;
    }

    [Serializable]
    public class TicketProperties {

        public string Model, Category, Password, Size;

        [JsonProperty("AC Charger")]
        public string acCharger;

        [JsonProperty("Tech Notes")]
        public string techNotes;

        [JsonProperty("Problem Type")]
        public string problemType;

        [JsonProperty("Password (type \"none\" if no password)")]
        public string passwordForPhone;

        [JsonProperty("IMEI or S/N")]
        public string imeiOrSn;

        [JsonProperty("IMEI/Serial")]
        public string imeiOrSnForPhone;

        [JsonProperty("Ever Been Wet")]
        public string everBeenWet;

        [JsonProperty("Previous Damage or Issues")]
        public string previousDamageOrIssues;

        [JsonProperty("Current Issue:")]
        public string currentIssue;

        public void SetACCharger(bool acCharger) {
            this.acCharger = acCharger ? "1" : "0";
        }

        public bool ACCharger() {
            return acCharger == "1";
        }

        public void SetEverBeenWet(bool everBeenWet) {
            this.everBeenWet = everBeenWet ? "1" : "0";
        }

        public bool EverBeenWet() {
            return everBeenWet == "1";
        }

    }

    [Serializable]
    public class AssetProperties {
        
        public string Make;

        [JsonProperty("Service Tag")]
        public string ServiceTag;
        public string notification_billing;
        public string notification_reports;
        public string notification_marketing;
        public string blank;

    }

    [Serializable]
    public class CustomerProperties {
        
        public string notification_billing, notification_reports, notification_marketing;

        public void SetNotificationBilling(bool notificationBilling) {
            notification_billing = notificationBilling ? "1" : "0";
        }

        public bool NotificationBilling() {
            return notification_billing == "1";
        }

        public void SetNotificationReports(bool notificationReports) {
            notification_reports = notificationReports ? "1" : "0";
        }

        public bool NotificationReports() {
            return notification_reports == "1";
        }

        public void SetNotificationMarketing(bool notificationMarketing) {
            notification_marketing = notificationMarketing ? "1" : "0";
        }

        public bool NotificationMarketing() {
            return notification_marketing == "1";
        }

    }

    [Serializable]
    public class RmmStore {
        
        public int? id, asset_id, account_id;
        public Triggers triggers;
        public WindowsUpdates windows_updates;
        public Emsisoft emsisoft;
        public General general;
        public DateTime created_at;
        public DateTime? updated_at;
        public object override_alert_agent_offline_mins, override_alert_agent_rearm_after_mins, override_low_hd_threshold, override_autoresolve_offline_alert,  override_low_hd_thresholds;
        
    }

    [Serializable]
    public class SnmpConfig {
        
        public int? port;
        public bool? enabled;
        public int? version;
        public string community;
        
    }

    [Serializable]
    public class Thumb {
        
        public string url;
        
    }

    [Serializable]
    public class LargeTicket : IComparable<LargeTicket> { // in OneLargeTicket

        public int id;
        public int number;
        public string subject;
        public DateTime created_at;
        public int customer_id;
        public string customer_business_then_name;
        public DateTime? due_date;
        public DateTime? start_at;
        public DateTime? end_at;
        public int? location_id;
        public string problem_type;
        public string status;
        public TicketProperties properties;
        public int? user_id;
        public DateTime? updated_at;
        public object pdf_url;
        public string intake_form_html;
        public object signature_name;
        public object signature_date;
        public int?[] asset_ids;
        public string priority;
        public DateTime? resolved_at;
        public object outtake_form_name;
        public object outtake_form_date;
        public object outtake_form_html;
        public object address;
        public Comment[] comments;
        public Attachment[] attachments;
        public TicketTimer[] ticket_timers;
        public object[] line_items;
        public object[] worksheet_results;
        public Asset[] assets;
        public object[] appointments;
        public TicketField[] ticket_fields;
        public TicketAnswer[] ticket_answers;
        public Customer customer;
        public object contact;
        public User user;
        public TicketType ticket_type;
        //public int ticket_type_id;

        public LargeTicket(string brand, string model, string color, string device, bool doesTicketNeedDevice, string[] problems, string[] doItIf, string[] prices, string otherDetails, DateTime due_date, DateTime creationDate, string howLong, string password, bool ACCharger, string[] itemsLeft, string needData, bool callBy, LargeTicket previousTicket) {
            TicketDetailsV1 ticketDetails = new TicketDetailsV1(brand, model, color, device, problems, doItIf, prices, otherDetails, howLong, itemsLeft, needData);
            UsePreviousValues(previousTicket);
            subject = ticketDetails.Subject(creationDate, due_date, doesTicketNeedDevice);
            properties.SetACCharger(ACCharger);
            this.due_date = due_date;
            properties.Password = password;
            properties.techNotes = "v1" + JsonConvert.SerializeObject(ticketDetails, Formatting.Indented);
        }

        public LargeTicket(string subject, string password, bool ACCharger, LargeTicket previousTicket) {
            UsePreviousValues(previousTicket);
            properties.SetACCharger(ACCharger);
            this.subject = subject;
            try {
                if((int)ticket_type.id == 9818 || (int)ticket_type.id == 9836) {
                    properties.Password = password;
                } else if((int)ticket_type.id == 9801) {
                    properties.passwordForPhone = password;
                }
            } catch { }
            if(GetPassword() == "") properties.Password = "n";
            try {
                if(properties.techNotes.Contains("v1{")) properties.techNotes = "";
            } catch { }
        }

        public LargeTicket() { }

        void UsePreviousValues(LargeTicket previousTicket) {
            id = previousTicket.id;
            number = previousTicket.number;
            subject = previousTicket.subject;
            created_at = previousTicket.created_at;
            customer_id = previousTicket.customer_id;
            customer_business_then_name = previousTicket.customer_business_then_name;
            due_date = previousTicket.due_date;
            start_at = previousTicket.start_at;
            end_at = previousTicket.end_at;
            location_id = previousTicket.location_id;
            problem_type = previousTicket.problem_type;
            status = previousTicket.status;
            properties = previousTicket.properties;
            user_id = previousTicket.user_id;
            updated_at = previousTicket.updated_at;
            pdf_url = previousTicket.pdf_url;
            intake_form_html = previousTicket.intake_form_html;
            signature_name = previousTicket.signature_name;
            signature_date = previousTicket.signature_date;
            asset_ids = previousTicket.asset_ids;
            priority = previousTicket.priority;
            resolved_at = previousTicket.resolved_at;
            outtake_form_name = previousTicket.outtake_form_name;
            outtake_form_date = previousTicket.outtake_form_date;
            outtake_form_html = previousTicket.outtake_form_html;
            address = previousTicket.address;
            comments = previousTicket.comments;
            attachments = previousTicket.attachments;
            ticket_timers = previousTicket.ticket_timers;
            line_items = previousTicket.line_items;
            worksheet_results = previousTicket.worksheet_results;
            assets = previousTicket.assets;
            appointments = previousTicket.appointments;
            ticket_fields = previousTicket.ticket_fields;
            ticket_answers = previousTicket.ticket_answers;
            customer = previousTicket.customer;
            contact = previousTicket.contact;
            user = previousTicket.user;
            ticket_type = previousTicket.ticket_type;
        }

        public bool WasPreDiagnosed() {
            try {
                return subject.ToLower().Contains("ckcl") || subject.ToLower().Contains("ck&cl") || subject.ToLower().Contains("chk and") || subject.ToLower().Contains("check and call");
            } catch {
                return false;
            }
        }

        public TicketDetailsV1 GetTicketDetails() {
            try {
                return JsonConvert.DeserializeObject<TicketDetailsV1>(properties.techNotes[2..]);
            } catch {
                return null;
            }
        }

        public string CreationDateFormatedToString() {
            if(created_at == new DateTime()) return "";
            return created_at.Month + "/" + created_at.Day + "/" + created_at.Year;
        }

        public string CreationTimeFormatedToString(bool includeAmPm = true) {
            if(created_at == new DateTime()) return "";
            bool pm = false;
            string minute = created_at.Minute.ToString();
            string hour = created_at.Hour.ToString();
            if(created_at.Minute < 10) minute = "0" + minute;
            if(created_at.Hour > 12) {
                hour = (created_at.Hour - 12).ToString();
                pm = true;
            }
            if(hour == "0") hour = "12";
            return hour + ":" + minute + (includeAmPm ? (pm ? " PM" : " AM") : "");
        }

        public string DueDateFormatedToString() {
            if(due_date == new DateTime() || due_date == null) return "";
            DateTime dueDate = (DateTime)due_date;
            if(created_at == due_date) return "";
            if(dueDate.Subtract(created_at).Days >= 1) return UsefullMethods.AddSuffix(dueDate.Day);
            bool pm = false;
            string minute = dueDate.Minute.ToString();
            string hour = dueDate.Hour.ToString();
            if(dueDate.Minute < 10) minute = "0" + minute;
            if(dueDate.Hour > 12) {
                hour = (dueDate.Hour - 12).ToString();
                pm = true;
            }
            if(hour == "0") hour = "12";
            return hour + ":" + minute + (pm ? " PM" : " AM");
        }

        public string GetPassword() {
            try {
                if(ticket_fields[0].ticket_type_id == 9818 || ticket_fields[0].ticket_type_id == 9836) {
                    if(properties.Password.ToLower().Trim() != "n" && properties.Password.ToLower().Trim() != "na" && properties.Password.ToLower().Trim() != "n/a" && properties.Password.ToLower().Trim() != "none") return properties.Password;
                } else if(ticket_fields[0].ticket_type_id == 9801) {
                    if(properties.passwordForPhone.ToLower().Trim() != "n" && properties.passwordForPhone.ToLower().Trim() != "na" && properties.passwordForPhone.ToLower().Trim() != "n/a" && properties.passwordForPhone.ToLower().Trim() != "none") return properties.passwordForPhone;
                }
                return "";
            } catch { return ""; }
        }

        public string GetRawPassword() {
            try {
                if(ticket_fields[0].ticket_type_id == 9818 || ticket_fields[0].ticket_type_id == 9836) {
                    return properties.Password;
                } else if(ticket_fields[0].ticket_type_id == 9801) {
                    return properties.passwordForPhone;
                }
                return "";
            } catch { return ""; }
        }

        public int CompareTo(LargeTicket other) {
            if(number < other.number) {
                return 1;
            } else if(number > other.number) {
                return -1;
            } else {
                return 0;
            }
        }

        public LargeTicketWithTicketTypeId ConvertToLargeTicketWithTicketTypeId() {
            return new LargeTicketWithTicketTypeId {
                id = id,
                number = number,
                subject = subject,
                created_at = created_at,
                customer_id = customer_id,
                customer_business_then_name = customer_business_then_name,
                due_date = due_date,
                start_at = start_at,
                end_at = end_at,
                location_id = location_id,
                problem_type = problem_type,
                status = status,
                properties = properties,
                user_id = user_id,
                updated_at = updated_at,
                pdf_url = pdf_url,
                intake_form_html = intake_form_html,
                signature_name = signature_name,
                signature_date = signature_date,
                asset_ids = asset_ids,
                priority = priority,
                resolved_at = resolved_at,
                outtake_form_name = outtake_form_name,
                outtake_form_date = outtake_form_date,
                outtake_form_html = outtake_form_html,
                address = address,
                comments = comments,
                attachments = attachments,
                ticket_timers = ticket_timers,
                line_items = line_items,
                worksheet_results = worksheet_results,
                assets = assets,
                appointments = appointments,
                ticket_fields = ticket_fields,
                ticket_answers = ticket_answers,
                customer = customer,
                contact = contact,
                user = user,
                ticket_type = ticket_type,
            };
        }

    }

    [Serializable]
    public class LargeTicketWithTicketTypeId {

        public int id;
        public int number;
        public string subject;
        public DateTime created_at;
        public int customer_id;
        public string customer_business_then_name;
        public DateTime? due_date;
        public DateTime? start_at;
        public DateTime? end_at;
        public int? location_id;
        public string problem_type;
        public string status;
        public TicketProperties properties;
        public int? user_id;
        public DateTime? updated_at;
        public object pdf_url;
        public string intake_form_html;
        public object signature_name;
        public object signature_date;
        public int?[] asset_ids;
        public string priority;
        public DateTime? resolved_at;
        public object outtake_form_name;
        public object outtake_form_date;
        public object outtake_form_html;
        public object address;
        public Comment[] comments;
        public Attachment[] attachments;
        public TicketTimer[] ticket_timers;
        public object[] line_items;
        public object[] worksheet_results;
        public Asset[] assets;
        public object[] appointments;
        public TicketField[] ticket_fields;
        public TicketAnswer[] ticket_answers;
        public Customer customer;
        public object contact;
        public User user;
        public TicketType ticket_type;
        public int ticket_type_id;

        public void SetTicketTypeIdAndChangeIfNull() {
            try {
                ticket_type_id = (int)ticket_type.id;
            } catch {
                ticket_type_id = 0;
            }
        }

        public LargeTicketWithTicketTypeId ChangeTicketTypeIdToComputer(string newPasswordToPut) {
            try {
                if((int)ticket_type.id == 1) _ = 1;
            } catch {
                SetTicketTypeIdAndChangeIfNull();
            }
            string legacyOptions = "";
            if(ticket_type_id == 9836) {
                if(properties.Model != "") legacyOptions += "Model: " + properties.Model;
                if(properties.imeiOrSn != "") legacyOptions += "\nIMEI or S/N: " + properties.imeiOrSn;
                legacyOptions += "\nEver been Wet: " + properties.EverBeenWet();
                if(properties.previousDamageOrIssues != "") legacyOptions += "\nPrevious Damage or Issues: " + properties.previousDamageOrIssues;
                if(properties.techNotes != "" && !properties.techNotes.Contains("{")) legacyOptions += "\nTech notes: " + properties.techNotes;
                if(properties.currentIssue != "") legacyOptions += "\nCurrent issue: " + properties.currentIssue;
                if(properties.Size != "") legacyOptions += "\nSize: " + properties.Size;
            }
            if(ticket_type_id == 9801) {
                if(properties.Model != "") legacyOptions += "Model: " + properties.Model;
                if(properties.imeiOrSnForPhone != "") legacyOptions += "\nIMEI or S/N: " + properties.imeiOrSnForPhone;
                legacyOptions += "\nEver been Wet: " + properties.EverBeenWet();
                if(properties.previousDamageOrIssues != "") legacyOptions += "\nPrevious Damage or Issues: " + properties.previousDamageOrIssues;
                if(properties.techNotes != "" && !properties.techNotes.Contains("{")) legacyOptions += "\nTech notes: " + properties.techNotes;
                if(properties.currentIssue != "") legacyOptions += "\nCurrent issue: " + properties.currentIssue;
                properties.Password = properties.passwordForPhone;
            }
            if(ticket_type_id == 23246) {
                if(properties.Model != "") legacyOptions += "\nModel: " + properties.Model;
                if(properties.techNotes != "" && !properties.techNotes.Contains("{")) legacyOptions += "\nTech notes: " + properties.techNotes;
            }
            properties.Password = newPasswordToPut.Trim() != "" ? newPasswordToPut : "n";
            ticket_type_id = 9818;
            properties.Model = legacyOptions;
            return this;
        }

        public string GetPassword() {
            try {
                if(ticket_fields[0].ticket_type_id == 9818 || ticket_fields[0].ticket_type_id == 9836) {
                    if(properties.Password.ToLower().Trim() != "n" && properties.Password.ToLower().Trim() != "na" && properties.Password.ToLower().Trim() != "n/a" && properties.Password.ToLower().Trim() != "none") return properties.Password;
                } else if(ticket_fields[0].ticket_type_id == 9801) {
                    if(properties.passwordForPhone.ToLower().Trim() != "n" && properties.passwordForPhone.ToLower().Trim() != "na" && properties.passwordForPhone.ToLower().Trim() != "n/a" && properties.passwordForPhone.ToLower().Trim() != "none") return properties.passwordForPhone;
                }
                return "";
            } catch { return ""; }
        }

    }

    [Serializable]
    public class SmallTicket : IComparable<SmallTicket> { // in SmallTickets

        public int id;
        public int number;
        public string subject;
        public DateTime created_at;
        public int customer_id;
        public string customer_business_then_name;
        public DateTime? due_date;
        public DateTime? resolved_at;
        public DateTime? start_at;
        public DateTime? end_at;
        public int? location_id;
        public string problem_type;
        public string status;
        public int? ticket_type_id;
        public TicketProperties properties;
        public int? user_id;
        public DateTime? updated_at;
        public string pdf_url;
        public string priority;
        public User user;

        public int CompareTo(SmallTicket other) {
            if(number < other.number) {
                return 1;
            } else if(number > other.number) {
                return -1;
            } else {
                return 0;
            }
        }

        public bool WasPreDiagnosed() {
            try {
                return subject.ToLower().Contains("ckcl") || subject.ToLower().Contains("ck&cl") || subject.ToLower().Contains("chk and") || subject.ToLower().Contains("check and call");
            } catch {
                return false;
            }
        }

        public string CreationDateFormatedToString() {
            if(created_at == new DateTime()) return "";
            return created_at.Month + "/" + created_at.Day + "/" + created_at.Year;
        }

        public string CreationTimeFormatedToString() {
            if(created_at == new DateTime()) return "";
            bool pm = false;
            string minute = created_at.Minute.ToString();
            string hour = created_at.Hour.ToString();
            if(created_at.Minute < 10) minute = "0" + minute;
            if(created_at.Hour > 12) {
                hour = (created_at.Hour - 12).ToString();
                pm = true;
            }
            if(hour == "0") hour = "12";
            return hour + ":" + minute + (pm ? " PM" : " AM");
        }

        public string GetPassword() {
            try {
                if(ticket_type_id == 9818 || ticket_type_id == 9836) {
                    if(properties.Password.ToLower().Trim() != "n" && properties.Password.ToLower().Trim() != "na" && properties.Password.ToLower().Trim() != "n/a" && properties.Password.ToLower().Trim() != "none") return properties.Password;
                } else if(ticket_type_id == 9801) {
                    if(properties.passwordForPhone.ToLower().Trim() != "n" && properties.passwordForPhone.ToLower().Trim() != "na" && properties.passwordForPhone.ToLower().Trim() != "n/a" && properties.passwordForPhone.ToLower().Trim() != "none") return properties.passwordForPhone;
                }
                return "";
            } catch { return ""; }
        }

    }

    [Serializable]
    public class Tickets { // Tickets = Get(Main.URL + "/tickets?query={query}")
        public Ticket[] tickets;
        public Meta meta;

        public SmallTicket[] ToSmallTicketArray() {
            List<SmallTicket> smallTickets = new List<SmallTicket>();
            for(int i = 0; i < tickets.Length; i++) {
                smallTickets.Add(new SmallTicket() {
                    id = tickets[i].id,
                    number = tickets[i].number,
                    subject = tickets[i].subject,
                    created_at = tickets[i].created_at,
                    customer_id = tickets[i].customer_id,
                    customer_business_then_name = tickets[i].customer_business_then_name,
                    due_date = tickets[i].due_date,
                    resolved_at = tickets[i].resolved_at,
                    start_at = tickets[i].start_at,
                    end_at = tickets[i].end_at,
                    location_id = tickets[i].location_id,
                    problem_type = tickets[i].problem_type,
                    status = tickets[i].status,
                    ticket_type_id = tickets[i].ticket_type_id,
                    properties = tickets[i].properties,
                    user_id = tickets[i].user_id,
                    updated_at = tickets[i].updated_at,
                    pdf_url = tickets[i].pdf_url,
                    priority = tickets[i].priority,
                    user = tickets[i].user
                });
            }
            smallTickets.Sort();
            return smallTickets.ToArray();
        }
    }

    [Serializable]

    public class Ticket { // in Tickets
        public int id;
        public int number;
        public string subject;
        public DateTime created_at;
        public int customer_id;
        public string customer_business_then_name;
        public DateTime? due_date;
        public DateTime? resolved_at;
        public DateTime? start_at;
        public DateTime? end_at;
        public int? location_id;
        public string problem_type;
        public string status;
        public int? ticket_type_id;
        public TicketProperties properties;
        public int? user_id;
        public DateTime? updated_at;
        public string pdf_url;
        public string priority;
        public List<Comment> comments;
        public User user;
    }

    [Serializable]
    public class TicketAnswer {
        public int? ticket_field_id;
        public string content;
        public DateTime created_at;
        public DateTime? updated_at;
        public int? account_id;
        public int? id;
    }

    [Serializable]
    public class TicketField {
        
        public int id;
        public string name;
        public string field_type;
        public bool? required;
        public int? account_id;
        public DateTime created_at;
        public DateTime? updated_at;
        public int? ticket_type_id;
        public bool? hidden;
        public int? position;
        public Answer[] answers;
        
    }

    [Serializable]
    public class TicketTimer {
        
        public int id;
        public int? ticket_id;
        public int? user_id;
        public DateTime? start_time;
        public DateTime? end_time;
        public bool? recorded;
        public DateTime created_at;
        public DateTime? updated_at;
        public bool? billable;
        public string notes;
        public object toggl_id;
        public object product_id;
        public object comment_id;
        public object ticket_line_item_id;
        public int? active_duration;
        
    }

    [Serializable]
    public class TicketType {
        
        public string name;
        public int? account_id;
        public DateTime created_at;
        public DateTime? updated_at;
        public bool? disabled;
        public object intake_terms;
        public bool? skip_intake;
        public object outtake_terms;
        public bool? skip_outtake;
        public int? id;
        public TicketField[] ticket_fields;
        
    }

    [Serializable]
    public class Triggers {
        
        public string bsod_triggered;
        public string time_triggered;
        public string no_av_triggered;
        public string defrag_triggered;
        public string firewall_triggered;
        public string app_crash_triggered;
        public string low_hd_space_triggered;
        public string smart_failure_triggered;
        public string device_manager_triggered;
        public string agent_offline_triggered;
        
    }

    [Serializable]
    public class WindowsUpdates { }

    [Serializable]
    public class SuperSmallTicket {
        
        public int? number;
        public string subject;
    }

    [Serializable]
    public class Result {
        public Table table;
    }

    [Serializable]
    public class SearchResult {
        
        public object quick_result;
        public Result[] results;
        public object error;

        public SuperSmallTicket[] OnlyGiveTheResultsThatAreSuperSmallTickets() {
            List<SuperSmallTicket> tickets = new List<SuperSmallTicket>();
            for(int i = 0; i < results.Length; i++) {
                if(results[i].table._type == "ticket") tickets.Add(results[i].table._source.table);
            }
            return tickets.ToArray();
        }

    }

    [Serializable]
    public class Source {
        
        public SuperSmallTicket table;
        
    }

    [Serializable]
    public class Table {
        
        public int? _id;
        public string _type, _index;
        public Source _source;
        
    }

    [Serializable]
    public class User {
        
        public int? id;
        public string email, full_name;
        public DateTime created_at;
        public DateTime? updated_at;
        public string group;

        [JsonProperty("admin?")]
        public bool? admin;
        public string color;
        
    }

    [Serializable]
    public class PostPhone {
        
        public string label;
        public string number, extension;

        public PostPhone(string number, bool isTextable) {
            this.number = number;
            if(isTextable) label = "Mobile";
        }

        public PostPhone(string number) {
            this.number = number;
            label = "Mobile";
        }
        
    }

    [Serializable]
    public class Phone {
        
        public int customer_id, id;
        public string label, number, extension;
        public DateTime created_at;
        public DateTime? updated_at;
        
    }

    [Serializable]
    public class Phones {

        public Phone[] phones;

        public string[] ToStringArray() {
            string[] oldPhones = new string[phones.Length];
            for(int i = 0; i < phones.Length; i++) {
                oldPhones[i] = phones[i].number;
            }
            return oldPhones;
        }

        public List<string> ToStringList() {
            List<string> oldPhones = new List<string>();
            for(int i = 0; i < phones.Length; i++) {
                oldPhones.Add(phones[i].number);
            }
            return oldPhones;
        }

    }

}
