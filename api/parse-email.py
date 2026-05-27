from http.server import BaseHTTPRequestHandler
import json
import re
import html
import os
from urllib.request import Request, urlopen

# ===========================================================================
# FIELD ALIASES — what to look for as labels in emails
# ===========================================================================
FIELD_ALIASES = {
    'prefix':              ['Prefix', 'Salutation', 'Title Prefix', 'Mr/Ms', 'Honorific'],
    'first_name':          ['Legal First Name', 'First Name', 'Given Name', 'Forename', 'FName',
                            'Client First Name', 'Guest First Name', 'Passenger First Name',
                            'Attendee First Name', 'Registrant First Name', 'Traveler First Name'],
    'middle_name':         ['Legal Middle Name', 'Middle Name', 'Middle Initial', 'MI'],
    'last_name':           ['Legal Last Name', 'Last Name', 'Surname', 'Family Name', 'LName',
                            'Client Last Name', 'Guest Last Name', 'Passenger Last Name',
                            'Attendee Last Name', 'Registrant Last Name', 'Traveler Last Name'],
    'full_name':           ['Full Name', 'Traveler Name', 'Passenger Name', 'Complete Name',
                            'Guest Name', 'Client Name', 'Lead Passenger', 'Primary Traveler',
                            'Attendee Name', 'Registrant Name', 'Name as per Passport',
                            'Name as per passport', 'Passport Name', 'Legal Name', 'Name'],
    'email_address':       ['Email Address', 'E-mail Address', 'E-mail', 'E mail', 'Email ID',
                            'Contact Email', 'Primary Email', 'Attendee Email', 'Registrant Email',
                            'Traveler Email', 'Email'],
    'cc_email_address':    ['CC Email Address', 'CC E-mail', 'CC Email', 'Carbon Copy',
                            'Secondary Email', 'Alt Email', 'Additional Email'],
    'company':             ['Company', 'Organization', 'Organisation', 'Employer',
                            'Business Name', 'Company Name', 'Affiliation', 'Employer Name'],
    'title':               ['Job Title', 'Position', 'Role', 'Occupation', 'Job Position'],
    'work_phone':          ['Work Phone', 'Office Phone', 'Business Phone', 'Work Number'],
    'home_phone':          ['Home Phone', 'Residence Phone', 'Home Number'],
    'mobile_phone':        ['Mobile Phone', 'Cell Phone', 'Cellphone', 'Cell', 'Mobile',
                            'Mobile Number', 'Phone Number', 'Phone', 'Contact Number', 'Tel'],
    'passport_number':     ['Guest Passport No.', 'Guest Passport Number', 'Passport Number',
                            'Passport No.', 'Passport No', 'Passport #', 'Document Number',
                            'Travel Document', 'Passport ID'],
    'passport_nationality':['Guest Passport Nationality', 'Passport Nationality', 'Nationality',
                            'Citizenship', 'Country of Citizenship', 'Issuing Country',
                            'Passport Country'],
    'passport_expiration_date':['Guest Passport Exp. Date', 'Guest Passport Expiration',
                            'Passport Expiration Date', 'Passport Expiration', 'Passport Expiry',
                            'Passport Exp', 'Document Expiry', 'Expiration Date', 'Expiry Date'],
    'guest_email':         ['Guest Email Address', 'Guest Email', 'Companion Email',
                            'Travel Partner Email', 'Plus One Email'],
    'guest_mobile_phone':  ['Guest Mobile Phone', 'Guest Mobile', 'Companion Phone',
                            'Travel Partner Phone', 'Plus One Phone'],
    'event_code':          ['Event Code', 'Reference Code', 'Booking Reference', 'Reservation Code',
                            'Confirmation Number', 'Booking ID', 'Booking Code',
                            'Reservation Number', 'PNR', 'Itinerary Number',
                            'Registration Code', 'Registration ID', 'Registration Number',
                            'Order Number', 'Order #', 'Conference Code'],
    'event_title':         ['Event Title', 'Event Name', 'Meeting Name', 'Tour Name', 'Trip Name',
                            'Package Name', 'Itinerary Name', 'Conference Name', 'Trip Title',
                            'Group Name', 'Program Name'],
    'event_date':          ['Event Date', 'Meeting Date', 'Start Date', 'Check-in Date',
                            'Check in Date', 'Check-in', 'Trip Start', 'Tour Start',
                            'Travel Start Date', 'Conference Date', 'Arrival Date'],
    'event_time':          ['Event Time', 'Start Time', 'Meeting Time', 'Check-in Time'],
    'request_name':        ['Request Name', 'Booking Name', 'Reservation Name'],
    'request_date':        ['Request Date', 'Submission Date', 'Date Submitted', 'Booking Date',
                            'Reservation Date', 'Order Date', 'Registration Date'],
    'gender':              ['Gender', 'Sex'],
    'date_of_birth':       ['Date of Birth', 'Birth Date', 'DOB', 'Birthday', 'Birthdate'],
    'redress_number':      ['Known Traveler Number', 'KTN', 'Redress Number', 'Redress',
                            'TSA Redress', 'Traveler Number', 'TSA Number', 'TSA PreCheck'],
    'age_category':        ['Age Category', 'Age Group', 'Passenger Type', 'Traveler Type',
                            'Guest Type', 'Attendee Type', 'Registration Type'],
    'food_preferences':    ['Food Preferences', 'Dietary Preferences', 'Meal Preference',
                            'Dietary Restrictions', 'Dietary Requirements', 'Meal Type',
                            'Special Diet', 'Dietary Needs', 'Food Allergies'],
    'special_requests':    ['Special Requests', 'Special Needs', 'Comments', 'Notes',
                            'Additional Information', 'Additional Notes', 'Remarks',
                            'Other Requirements', 'Accessibility Requirements',
                            'Accommodation Needs'],
    'departure_time':      ['Departure Time', 'Departure Date', 'Outbound Date', 'Depart Date',
                            'Travel Date', 'Departure'],
    'departure_trip':      ['Departure Trip', 'Departure Route', 'Outbound Trip', 'Outbound Flight',
                            'Outbound', 'From'],
    'return_time':         ['Return Time', 'Return Date', 'Inbound Date', 'Check-out Date',
                            'Check out Date', 'Check-out', 'Return'],
    'return_trip':         ['Return Trip', 'Return Route', 'Inbound Trip', 'Inbound Flight',
                            'Inbound', 'To'],
    'ticket_type':         ['Ticket Type', 'Cabin Class', 'Class of Service', 'Fare Class',
                            'Service Class', 'Travel Class', 'Class'],
    'seating':             ['Seating', 'Seat Preference', 'Seat Type', 'Seat Selection',
                            'Seat Assignment'],
    'reservation_status':  ['Reservation Status', 'Booking Status', 'Order Status',
                            'Confirmation Status', 'Registration Status'],
    'airline_preference_1':['Airline Preference 1', 'Preferred Airline 1', 'Airline 1',
                            'Carrier Preference 1', 'Preferred Carrier 1', 'Airline Preference'],
    'airline_preference_2':['Airline Preference 2', 'Preferred Airline 2', 'Airline 2',
                            'Carrier Preference 2', 'Preferred Carrier 2'],
    'airline_preference_3':['Airline Preference 3', 'Preferred Airline 3', 'Airline 3',
                            'Carrier Preference 3', 'Preferred Carrier 3'],
    'frequent_flyer_number_1':['Rewards Number 1', 'Frequent Flyer 1', 'FF Number 1',
                            'Loyalty Number 1', 'Mileage Number 1', 'FF#1', 'Frequent Flyer Number'],
    'frequent_flyer_number_2':['Rewards Number 2', 'Frequent Flyer 2', 'FF Number 2',
                            'Loyalty Number 2', 'FF#2'],
    'frequent_flyer_number_3':['Rewards Number 3', 'Frequent Flyer 3', 'FF Number 3',
                            'Loyalty Number 3', 'FF#3'],
}

SECTION_ALIASES = {
    'contact':  ['Contact Information', 'Traveler Information', 'Traveler Info',
                 'Passenger Details', 'Personal Information', 'Personal Details',
                 'Guest Information', 'Client Information', 'Primary Contact',
                 'Lead Passenger Information', 'Attendee Information', 'Registrant Information',
                 'Your Information', 'About You', 'Contact Details'],
    'event':    ['Event Information', 'Event Details', 'Meeting Information',
                 'Trip Information', 'Tour Details', 'Itinerary Details',
                 'Travel Details', 'Conference Information', 'Session Information'],
    'request':  ['Request Details', 'Booking Details', 'Reservation Details',
                 'Booking Information', 'Reservation Information', 'Travel Request',
                 'Flight Information', 'Travel Preferences', 'Trip Details',
                 'Registration Details', 'Order Details', 'Flight Details'],
}

SECTION_FIELDS = {
    'contact': ['prefix', 'first_name', 'middle_name', 'last_name', 'email_address',
                'cc_email_address', 'company', 'title', 'work_phone', 'home_phone',
                'mobile_phone', 'passport_number', 'passport_nationality',
                'passport_expiration_date', 'guest_email', 'guest_mobile_phone'],
    'event':   ['event_code', 'event_title', 'event_date', 'event_time'],
    'request': ['request_name', 'request_date', 'full_name', 'gender', 'date_of_birth',
                'redress_number', 'age_category', 'food_preferences', 'special_requests',
                'departure_time', 'departure_trip', 'return_time', 'return_trip',
                'ticket_type', 'seating', 'reservation_status',
                'airline_preference_1', 'airline_preference_2', 'airline_preference_3',
                'frequent_flyer_number_1', 'frequent_flyer_number_2', 'frequent_flyer_number_3'],
}

JUNK_VALUES = {'', 'go', 'empty', 'n/a', 'na', 'none', '-', '★', '•', '☐', '☒', 'tbd', 'tba',
               'null', 'undefined', 'blank', 'pending', 'not provided', 'not specified'}

SIGNATURE_MARKERS = [
    'CONFIDENTIALITY', 'NEHMAN RAHIMI', 'SMARTSHEET WORKFLOW',
    'AUTOMATION INTERN', r'\[cid:', 'kensingtoncorporate', '@kensington',
    'unsubscribe', 'this email and any attachments',
]

SIGNATURE_TERMS_IN_VALUES = [
    'NEHMAN RAHIMI', 'KENSINGTON', 'CONFIDENTIALITY',
    'SMARTSHEET WORKFLOW', 'CID:', '@KENSINGTON', 'AUTOMATION INTERN',
    'UNSUBSCRIBE',
]

FORMAT_SIGNATURES = {
    'CVENT':                ['cvent', 'cvent.com', 'cvent request', 'cvent registration',
                             'reservation status:', 'departure trip:', 'airline preference 1:'],
    'Swoogo':               ['swoogo', 'swoogo.com', 'powered by swoogo', 'registration code',
                             'your registration is confirmed'],
    'Jotform':              ['jotform', 'jotform.com', 'powered by jotform', 'submission id'],
    'Google Forms':         ['docs.google.com/forms', 'google forms', 'forms.gle',
                             'submitted your response', 'form responses'],
    'Microsoft Forms':      ['forms.office.com', 'forms.microsoft.com', 'microsoft forms'],
    'Typeform':             ['typeform', 'typeform.com', 'powered by typeform'],
    'SurveyMonkey':         ['surveymonkey', 'surveymonkey.com'],
    'Formstack':            ['formstack', 'formstack.com'],
    'Wufoo':                ['wufoo', 'wufoo.com'],
    'Zoho Forms':           ['zoho forms', 'forms.zoho'],
    'HubSpot Form':         ['hsforms', 'hubspot form', 'hs-forms'],
    'Hotel Confirmation':   ['check-in date', 'check-out date', 'room type',
                             'nightly rate', 'reservation confirmation',
                             'hotel confirmation', 'room reservation'],
    'Airline Confirmation': ['flight number', 'departure airport', 'boarding pass',
                             'e-ticket', 'flight confirmation', 'booking reference'],
    'Eventbrite':           ['eventbrite', 'eventbrite.com', 'order #', 'order summary'],
    'Travel Agent Email':   ['travel agent', 'travel advisor', 'on behalf of', 'client request',
                             'agent reference'],
}

FORM_PLATFORM_INDICATORS = [
    'cvent', 'cvent.com', 'cvent request', 'cvent registration',
    'swoogo', 'swoogo.com', 'powered by swoogo',
    'jotform', 'jotform.com', 'powered by jotform',
    'docs.google.com/forms', 'google forms', 'forms.gle',
    'forms.office.com', 'forms.microsoft.com', 'microsoft forms',
    'typeform', 'typeform.com', 'powered by typeform',
    'eventbrite', 'eventbrite.com',
    'surveymonkey', 'surveymonkey.com',
    'formstack', 'formstack.com',
    'wufoo', 'wufoo.com',
    'zoho forms', 'forms.zoho',
    'hsforms', 'hubspot form', 'hs-forms',
]

CONTACT_TABLE_SIGNALS = [
    'prefix:', 'first name:', 'middle name:', 'last name:',
    'email address:', 'email:', 'mobile phone:', 'work phone:', 'home phone:',
    'passport no.:', 'passport number:', 'passport nationality:',
    'guest email', 'guest passport', 'date of birth:', 'dob:', 'gender:',
    'reservation status:', 'departure trip:', 'return trip:',
    'airline preference', 'ticket type:', 'seating:',
    'company:', 'job title:', 'full name:', 'traveler name:',
    'name as per passport:', 'passport name:', 'legal name:',
    'event code:', 'event title:', 'event date:',
    'request name:', 'request date:',
    'nationality:', 'citizenship:', 'phone:', 'name:',
]

HARD_NEGATIVE_PATTERNS = [
    'reset your password', 'sign-in attempt', 'sign in attempt',
    'verification code', 'verify your email', 'verify your account',
    'click here to unsubscribe',
    'two-factor authentication', '2fa code',
    'security alert', 'suspicious activity',
    'wire transfer request', 'invoice attached',
    'we noticed a sign-in',
]


def is_registration_email(email_text, email_subject=''):
    lower = email_text.lower()
    subject_lower = email_subject.lower()
    combined = lower + ' ' + subject_lower

    hard_neg_count = sum(1 for p in HARD_NEGATIVE_PATTERNS if p in combined)
    if hard_neg_count >= 1:
        return (False, 'hard_negative_match', 0)

    for indicator in FORM_PLATFORM_INDICATORS:
        if indicator in combined:
            return (True, f'platform_match:{indicator}', 10)

    subject_keywords = [
        'registration', 'registered', 'reservation',
        'booking', 'itinerary', 'rsvp',
        'attendee', 'group air', 'travel request',
    ]
    subject_hits = sum(1 for k in subject_keywords if k in subject_lower)
    table_hits = sum(1 for s in CONTACT_TABLE_SIGNALS if s in lower)

    if subject_hits >= 1 and table_hits >= 3:
        return (True, f'subject+table:{subject_hits}/{table_hits}', 8)

    if table_hits >= 5:
        return (True, f'strong_table_structure:{table_hits}', 7)

    identity_signals = ['name:', 'first name:', 'last name:', 'full name:',
                        'name as per passport:', 'email:', 'email address:',
                        'date of birth:', 'dob:', 'passport']
    identity_hits = sum(1 for s in identity_signals if s in lower)
    if identity_hits >= 2:
        return (True, f'plain_text_identity:{identity_hits}', 5)

    return (False, f'no_strong_signals (table:{table_hits}, subject:{subject_hits})', 0)


def detect_format(email_text):
    lower = email_text.lower()
    scores = {}
    for fmt, signatures in FORMAT_SIGNATURES.items():
        score = sum(1 for sig in signatures if sig.lower() in lower)
        if score > 0:
            scores[fmt] = score
    if not scores:
        return ('Unknown', 0)
    best = max(scores, key=scores.get)
    return (best, scores[best])


def _build_all_labels_pattern():
    all_labels = []
    for aliases in FIELD_ALIASES.values():
        all_labels.extend(aliases)
    all_labels.sort(key=len, reverse=True)
    return '|'.join(re.escape(label) for label in all_labels)


_ALL_LABELS_PATTERN = _build_all_labels_pattern()


def clean_html_to_text(html_body):
    if not html_body:
        return ''
    text = html.unescape(html_body)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'</(td|tr|th|p|div|li|h\d)\s*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'<mailto:[^>]+>', '', text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n\s*\n+', '\n', text)
    return text.strip()


def cut_signature(text):
    data_start_markers = [
        r'Contact Information', r'Traveler Information', r'Personal Information',
        r'Guest Information', r'Client Information', r'Event Information',
        r'Event Details', r'Request Details', r'Booking Details',
        r'Reservation Details', r'Registration Details', r'Attendee Information',
        r'Prefix\s*:', r'First Name\s*:', r'Last Name\s*:',
        r'Email Address\s*:', r'Full Name\s*:', r'Traveler Name\s*:',
        r'Name as per [Pp]assport\s*:', r'Name\s*:',
    ]

    data_start = 0
    for marker in data_start_markers:
        match = re.search(marker, text, re.IGNORECASE)
        if match:
            data_start = match.start()
            break

    earliest = len(text)
    for marker in SIGNATURE_MARKERS:
        match = re.search(marker, text[data_start:], re.IGNORECASE)
        if match:
            absolute_pos = data_start + match.start()
            if absolute_pos < earliest:
                earliest = absolute_pos

    if data_start == 0 and earliest < len(text) * 0.3:
        return text.strip()

    return text[:earliest].strip()


def get_section(text, section_key):
    section_names = SECTION_ALIASES[section_key]
    other_sections = []
    for k, names in SECTION_ALIASES.items():
        if k != section_key:
            other_sections.extend(names)
    next_pattern = '|'.join(re.escape(n) for n in other_sections)
    for name in section_names:
        if next_pattern:
            pattern = rf'\b{re.escape(name)}\b(.*?)(?=\b(?:{next_pattern})\b|\Z)'
        else:
            pattern = rf'\b{re.escape(name)}\b(.*?)\Z'
        match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return text


def is_junk(value):
    if not value:
        return True
    cleaned = value.strip().lower()
    if cleaned in JUNK_VALUES:
        return True
    stripped = re.sub(r'[\s ​  ]+', '', value.strip())
    if stripped and re.match(r'^[★☆✦✯✧⭐•·●○◯◌◦‣⁃☐☑☒✓✔✗✘✕❌×÷\-_\.\*=~`#·•⋅…]+$', stripped):
        return True
    if re.match(r'^[\[\(\<\{].*[\]\)\>\}]$', value.strip()) and len(value.strip()) < 25:
        inner = re.sub(r'[\[\]\(\)\<\>\{\}]', '', value.strip()).strip().lower()
        if inner in {'empty', 'none', 'blank', 'n/a', 'na', 'tbd', 'tba', '', '-', 'null', 'undefined'}:
            return True
    if re.match(rf'^({_ALL_LABELS_PATTERN})[ \t]*[:\-=]', value.strip(), re.IGNORECASE):
        return True
    return False


def has_signature_text(value):
    if not value:
        return False
    upper = value.upper()
    return any(term in upper for term in SIGNATURE_TERMS_IN_VALUES)


def _starts_with_label(line):
    pattern = rf'^[ \t]*(?:{_ALL_LABELS_PATTERN})[ \t]*[:\-=]'
    return bool(re.match(pattern, line, re.IGNORECASE))


def _collect_multiline_value(first_line, rest):
    parts = [first_line]
    for line in rest.split('\n'):
        stripped = line.strip()
        if not stripped:
            break
        if _starts_with_label(stripped):
            break
        parts.append(stripped)
    value = ' '.join(parts)
    value = re.sub(r'\s+', ' ', value).strip()
    return value


def _capture_value_from(text):
    nl_idx = text.find('\n')
    if nl_idx == -1:
        same_line = text.strip()
    else:
        same_line = text[:nl_idx].strip()
    if same_line:
        if _starts_with_label(same_line):
            return ''
        return _collect_multiline_value(same_line, text[nl_idx+1:] if nl_idx >= 0 else '')
    if nl_idx == -1:
        return ''
    remaining = text[nl_idx+1:]
    while remaining.startswith('\n'):
        remaining = remaining[1:]
    next_nl = remaining.find('\n')
    next_line = remaining[:next_nl].strip() if next_nl >= 0 else remaining.strip()
    if not next_line:
        return ''
    if _starts_with_label(next_line):
        return ''
    rest_after = remaining[next_nl+1:] if next_nl >= 0 else ''
    return _collect_multiline_value(next_line, rest_after)


def extract_field(section_text, field_key, exclude_prefixes=None):
    aliases = FIELD_ALIASES[field_key]
    for alias in aliases:
        if exclude_prefixes:
            lookbehind = ''.join(rf'(?<!{re.escape(p)} )' for p in exclude_prefixes)
        else:
            lookbehind = ''
        label_pattern = rf'{lookbehind}\b{re.escape(alias)}[ \t]*[:\-=][ \t]*'
        match = re.search(label_pattern, section_text, re.IGNORECASE)
        if not match:
            continue
        rest = section_text[match.end():]
        value = _capture_value_from(rest)
        if not is_junk(value) and not has_signature_text(value):
            return value
    return ''


def extract_email(section_text, field_key):
    email_re = r'([\w\.\-]+@[\w\.\-]+\.\w+)'
    if field_key == 'email_address':
        pattern = rf'(?<!CC )(?<!Guest )(?:Email\s+Address|E-mail\s+Address|Email|E-mail|E mail)\s*[:\-=]\s*{email_re}'
    elif field_key == 'cc_email_address':
        pattern = rf'CC\s+(?:Email\s+Address|E-mail|Email)\s*[:\-=]\s*{email_re}'
    elif field_key == 'guest_email':
        pattern = rf'Guest\s+(?:Email\s+Address|Email)\s*[:\-=]\s*{email_re}'
    else:
        return ''
    match = re.search(pattern, section_text, re.IGNORECASE)
    if match:
        candidate = match.group(1)
        if 'kensington' in candidate.lower():
            return ''
        return candidate
    return ''


def normalize_date_field(value):
    if not value:
        return value
    match = re.match(r'(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})', value)
    if match:
        return match.group(1)
    month_pattern = re.search(
        r'(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|'
        r'Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}',
        value, re.IGNORECASE
    )
    if month_pattern:
        return month_pattern.group(0)
    short_month = re.match(r'\d{1,2}[\-\s][A-Za-z]{3}[\-\s]\d{2,4}', value)
    if short_month:
        return short_month.group(0)
    return value


def normalize_phone(value):
    if not value:
        return value
    cleaned = re.sub(r'[^\d\+\s\-\(\)\.]', '', value).strip()
    return cleaned if cleaned else value


def simplify_route(trip_text):
    if not trip_text:
        return trip_text
    codes = re.findall(r'\(([A-Z]{3})\)', trip_text)
    if len(codes) >= 2:
        return f'{codes[0]} -> {codes[1]}'
    return trip_text


def parse_full_name_fallback(output):
    if not output.get('full_name'):
        return
    name_text = re.sub(r'\s+(JR|SR|II|III|IV|V)\.?$', '', output['full_name'], flags=re.IGNORECASE).strip()
    parts = name_text.split()
    if not output.get('first_name') and len(parts) >= 1:
        output['first_name'] = parts[0]
    if not output.get('last_name') and len(parts) >= 2:
        output['last_name'] = parts[-1]
    if not output.get('middle_name') and len(parts) >= 3:
        output['middle_name'] = ' '.join(parts[1:-1])


def extract_emails_fallback(text, output):
    if output.get('email_address'):
        return
    emails = re.findall(r'[\w\.\-]+@[\w\.\-]+\.\w+', text)
    for email in emails:
        if 'kensington' in email.lower():
            continue
        if 'nehmanmain' in email.lower():
            continue
        output['email_address'] = email
        return


def extract_name_fallback(text, output):
    if output.get('first_name') and output.get('last_name'):
        return
    name_match = re.search(r'(?:Name|Full Name|Traveler|Passenger)\s*[:\-=]\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)',
                           text, re.IGNORECASE)
    if name_match:
        parts = name_match.group(1).split()
        if not output.get('first_name'):
            output['first_name'] = parts[0]
        if not output.get('last_name') and len(parts) >= 2:
            output['last_name'] = parts[-1]


def calculate_confidence(output):
    critical = ['first_name', 'last_name', 'email_address']
    important = ['mobile_phone', 'event_title', 'departure_time', 'return_time', 'full_name']
    optional = ['gender', 'date_of_birth', 'passport_number', 'event_code',
                'request_name', 'ticket_type', 'reservation_status']
    score = 0
    max_score = (len(critical) * 10) + (len(important) * 5) + (len(optional) * 2)
    for f in critical:
        if output.get(f):
            score += 10
    for f in important:
        if output.get(f):
            score += 5
    for f in optional:
        if output.get(f):
            score += 2
    return int((score / max_score) * 100)


def parse_email(html_email_body, email_subject=''):
    PARSER_VERSION = '2.3-strict-detection'

    text = clean_html_to_text(html_email_body)
    text = cut_signature(text)

    combined_text = email_subject + ' ' + text
    is_reg, detection_reason, reg_confidence = is_registration_email(combined_text, email_subject)

    output = {field: '' for fields in SECTION_FIELDS.values() for field in fields}

    if not is_reg:
        output['should_process'] = False
        output['source_form'] = 'Not a Registration'
        output['confidence_score'] = 0
        output['needs_review'] = False
        output['detection_reason'] = detection_reason
        output['parser_version'] = PARSER_VERSION
        return output

    source_form, format_score = detect_format(combined_text)

    contact_section = get_section(text, 'contact')
    event_section = get_section(text, 'event')
    request_section = get_section(text, 'request')

    section_map = {
        'contact': contact_section,
        'event': event_section,
        'request': request_section,
    }

    GUEST_EXCLUDE = ['Guest']

    for section_key, fields in SECTION_FIELDS.items():
        section_text = section_map[section_key]
        for field in fields:
            if field in ('email_address', 'cc_email_address', 'guest_email'):
                output[field] = extract_email(section_text, field)
                continue
            if field in ('first_name', 'last_name', 'middle_name', 'mobile_phone'):
                output[field] = extract_field(section_text, field, exclude_prefixes=GUEST_EXCLUDE)
            else:
                output[field] = extract_field(section_text, field)

    for field in ['departure_time', 'return_time', 'event_date', 'date_of_birth',
                  'passport_expiration_date', 'request_date']:
        output[field] = normalize_date_field(output[field])

    for field in ['mobile_phone', 'work_phone', 'home_phone', 'guest_mobile_phone']:
        output[field] = normalize_phone(output[field])

    if output.get('passport_nationality'):
        output['passport_nationality'] = output['passport_nationality'].title()

    output['departure_trip'] = simplify_route(output['departure_trip'])
    output['return_trip'] = simplify_route(output['return_trip'])

    parse_full_name_fallback(output)
    extract_emails_fallback(text, output)
    extract_name_fallback(text, output)

    if output.get('request_name'):
        output['request_name'] = re.sub(r'\s+', ' ', output['request_name']).strip()

    for key in list(output.keys()):
        val = output[key]
        if isinstance(val, str) and has_signature_text(val):
            output[key] = ''
        elif val and isinstance(val, str):
            cleaned = re.sub(
                r'^[\s★☆✦✯✧⭐•·●○◯◌◦‣⁃☐☑☒✓✔✗✘✕❌×÷\-_\.\*=~`#·•⋅…]+|'
                r'[\s★☆✦✯✧⭐•·●○◯◌◦‣⁃☐☑☒✓✔✗✘✕❌×÷\-_\.\*=~`#·•⋅…]+$',
                '', val
            )
            if is_junk(cleaned):
                output[key] = ''
            else:
                output[key] = cleaned

    has_identity = bool(
        output.get('first_name') or output.get('last_name') or
        output.get('full_name') or output.get('email_address')
    )
    if not has_identity:
        output['should_process'] = False
        output['source_form'] = source_form if source_form != 'Unknown' else 'Empty Extraction'
        output['confidence_score'] = 0
        output['needs_review'] = True
        output['detection_reason'] = f'{detection_reason}; no_identity_extracted'
        output['parser_version'] = PARSER_VERSION
        return output

    output['source_form'] = source_form
    confidence = calculate_confidence(output)
    output['confidence_score'] = confidence
    output['needs_review'] = True if confidence < 50 else False
    output['should_process'] = True
    output['detection_reason'] = detection_reason
    output['parser_version'] = PARSER_VERSION

    return output


CVENT_SHEET_ID = '1658234917048196'
CVENT_COLUMN_MAP = {
    'prefix':                   991891301896068,
    'first_name':               5495490929266564,
    'middle_name':              3243691115581316,
    'last_name':                7747290742951812,
    'date_of_birth':            2117791208738692,
    'email_address':            6621390836109188,
    'cc_email_address':         4369591022423940,
    'company':                  8873190649794436,
    'title':                    77097627586436,
    'work_phone':               4580697254956932,
    'home_phone':               2328897441271684,
    'mobile_phone':             6832497068642180,
    'passport_nationality':     1202997534429060,
    'passport_number':          5706597161799556,
    'passport_expiration_date': 7958396975484804,
    'guest_email':              640047581007748,
    'guest_mobile_phone':       5143647208378244,
    'event_code':               2891847394692996,
    'event_title':              7395447022063492,
    'event_date':               1765947487850372,
    'event_time':               6269547115220868,
    'request_name':             4017747301535620,
    'request_date':             8521346928906116,
    'full_name':                358572604297092,
    'gender':                   4862172231667588,
    'redress_number':           2610372417982340,
    'departure_time':           1484472511139716,
    'departure_trip':           5988072138510212,
    'return_time':              3736272324824964,
    'return_trip':              8239871952195460,
    'ticket_type':              921522557718404,
    'seating':                  5425122185088900,
    'age_category':             3173322371403652,
    'food_preferences':         7676921998774148,
    'special_requests':         2047422464561028,
    'reservation_status':       6551022091931524,
    'airline_preference_1':     4299222278246276,
    'frequent_flyer_number_1':  8802821905616772,
    'airline_preference_2':     217835115941764,
    'frequent_flyer_number_2':  4721434743312260,
    'airline_preference_3':     2469634929627012,
    'frequent_flyer_number_3':  6973234556997508,
    'source_form':              1906684976205700,
    'confidence_score':         6410284603576196,
}


MASTER_SHEET_ID = '8780932377956228'
MASTER_COLUMN_MAP = {
    'first_name':               5726513277472644,
    'middle_name':              3474713463787396,
    'last_name':                7978313091157892,
    'date_of_birth':            659963696680836,
    'gender':                   5163563324051332,
    'nationality':              2911763510366084,
    'email_address':            7415363137736580,
    'cc_email_address':         8662414441877380,
    'mobile_phone':             1625540024110980,
    'work_phone':               2751439930953604,
    'home_phone':               7255039558324100,
    'company':                  499640117268356,
    'title':                    5003239744638852,
    'passport_number':          4037663417208708,
    'passport_expiration_date': 8541263044579204,
    'passport_nationality':     6129139651481476,
    'guest_email':              5566189698060164,
    'guest_mobile_phone':       3314389884374916,
    'event_code':               7817989511745412,
    'event_title':              2188489977532292,
    'event_date':               6692089604902788,
    'event_time':               4440289791217540,
    'request_name':             8943889418588036,
    'request_date':             42243280113540,
    'full_name':                4545842907484036,
    'redress_number':           3756188440498052,
    'departure_time':           6797642721169284,
    'departure_trip':           1168143186956164,
    'return_time':              5671742814326660,
    'return_trip':              3419943000641412,
    'ticket_type':              7923542628011908,
    'seating':                  605193233534852,
    'age_category':             5108792860905348,
    'food_preferences':         2856993047220100,
    'special_requests':         7360592674590596,
    'reservation_status':       1731093140377476,
    'airline_preference_1':     6234692767747972,
    'frequent_flyer_number_1':  3982892954062724,
    'airline_preference_2':     8486492581433220,
    'frequent_flyer_number_2':  323718256824196,
    'airline_preference_3':     4827317884194692,
    'frequent_flyer_number_3':  2575518070509444,
    'source_form':              3138468023930756,
    'confidence_score':         7642067651301252,
}


DATE_COLUMNS = {659963696680836, 8541263044579204, 2067338580234116}

def _normalize_date_for_smartsheet(val):
    if not val:
        return val
    for fmt in ('%m/%d/%Y', '%d/%m/%Y', '%Y-%m-%d', '%m-%d-%Y', '%d-%m-%Y',
                '%b %d, %Y', '%B %d, %Y', '%d %b %Y', '%d %B %Y'):
        try:
            from datetime import datetime
            dt = datetime.strptime(val.strip(), fmt)
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            continue
    return val

def _write_rows(token, sheet_id, column_map, parsed, extra_cells=None):
    cells = []
    for field, col_id in column_map.items():
        val = parsed.get(field, '')
        if val != '' and val is not None:
            if col_id in DATE_COLUMNS:
                val = _normalize_date_for_smartsheet(val)
            cells.append({'columnId': col_id, 'value': val})
    if extra_cells:
        cells.extend(extra_cells)
    if not cells:
        return 'skipped — no data'
    payload = json.dumps([{'toTop': True, 'cells': cells}]).encode()
    req = Request(
        f'https://api.smartsheet.com/2.0/sheets/{sheet_id}/rows',
        data=payload,
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        resp = urlopen(req)
        return f'ok ({resp.status})'
    except Exception as e:
        detail = ''
        if hasattr(e, 'read'):
            try:
                detail = e.read().decode()
            except Exception:
                pass
        return f'error: {str(e)} | {detail}'


def write_to_smartsheet(parsed):
    token = os.environ.get('SMARTSHEET_API_TOKEN', '')
    if not token:
        return {'cvent_sheet': 'skipped — no token', 'master_sheet': 'skipped — no token'}

    cvent_result = _write_rows(token, CVENT_SHEET_ID, CVENT_COLUMN_MAP, parsed)

    master_extra = [
        {'columnId': 6155241207926660, 'value': 'CVENT'},
    ]
    master_result = _write_rows(token, MASTER_SHEET_ID, MASTER_COLUMN_MAP, parsed, master_extra)

    return {'cvent_sheet': cvent_result, 'master_sheet': master_result}


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)

        try:
            data = json.loads(body)
            html_email_body = data.get('html_email_body', '') or data.get('body', '') or data.get('Body', '')
            email_subject = data.get('email_subject', '') or data.get('subject', '') or data.get('Subject', '')

            result = parse_email(html_email_body, email_subject)

            if result.get('should_process'):
                ss_result = write_to_smartsheet(result)
                result['smartsheet_write'] = ss_result

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())
