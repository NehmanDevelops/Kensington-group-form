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
                            'Client Name', 'Lead Passenger', 'Primary Traveler',
                            'Attendee Name', 'Registrant Name', 'Name as per Passport',
                            'Name as per passport', 'Passport Name', 'Legal Name', 'Name'],
    # Dedicated guest-name field (Vera 2026-07-08): the accompanying guest on a
    # registration. 'Guest Name' used to be a full_name alias — moved here.
    'guest_name':          ['Guest Name', 'Guest Full Name', 'Companion Name',
                            'Travel Partner Name', 'Plus One Name'],
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
    # CVENT emails carry the Kensington group id as "Event ID:" (or "Group ID:")
    # pasted at the very top of the email; Swoogo uses "Kensington Group ID:".
    'group_id':            ['Kensington Group ID', 'KCG Group ID', 'Group ID', 'GROUP ID',
                            'Event ID', 'EVENT ID'],
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
    'known_traveller_number':['Known Traveller Number', 'Known Traveler Number', 'KTN',
                            'TSA PreCheck', 'Traveler Number', 'TSA Number'],
    'redress_number':      ['Redress Number', 'Redress', 'TSA Redress'],
    'age_category':        ['Age Category', 'Age Group', 'Passenger Type', 'Traveler Type',
                            'Guest Type', 'Attendee Type', 'Registration Type', 'Registrant Type'],
    'air_selection':       ['Air Selection', 'Air Booking', 'Flight Booking Option', 'Air Option'],
    'food_preferences':    ['Food Preferences', 'Dietary Preferences', 'Meal Preference',
                            'Dietary Restrictions', 'Dietary Requirements', 'Meal Type',
                            'Special Diet', 'Dietary Needs', 'Food Allergies'],
    'special_requests':    ['Special Requests', 'Special Request', 'Special Needs', 'Comments', 'Notes',
                            'Additional Information', 'Additional Notes', 'Remarks',
                            'Other Requirements', 'Accessibility Requirements',
                            'Accommodation Needs'],
    'departure_time':      ['Departure Date', 'Depature Date', 'Outbound Date',
                            'Depart Date', 'Travel Date'],
    'departure_time_pref': ['Departure Time', 'Depart Time'],
    'departure_trip':      ['Departure Trip', 'Departure Route', 'Outbound Trip', 'Outbound Flight',
                            'Outbound', 'From'],
    'departure_airport':   ['Departure Airport', 'Departing Airport', 'Origin Airport',
                            'Departing From', 'Flying From', 'Origin City'],
    'arrival_airport':     ['Arrival Airport', 'Arriving Airport', 'Destination Airport',
                            'Arriving At', 'Flying To', 'Destination City'],
    'return_time':         ['Return Date', 'Inbound Date', 'Check-out Date',
                            'Check out Date', 'Check-out'],
    'return_time_pref':    ['Return Time', 'Return Departure Time'],
    'return_trip':         ['Return Trip', 'Return Route', 'Inbound Trip', 'Inbound Flight',
                            'Inbound', 'To'],
    'ticket_type':         ['Ticket Type', 'Cabin Class', 'Class of Service', 'Fare Class',
                            'Service Class', 'Travel Class', 'Class'],
    'seating':             ['Seating', 'Seating Preference', 'Seat Preference', 'Seat Type',
                            'Seat Selection', 'Seat Assignment'],
    'reservation_status':  ['Reservation Status', 'Booking Status', 'Order Status',
                            'Confirmation Status', 'Registration Status'],
    'airline_preference_1':['Airline Preference 1', 'Preferred Airline 1', 'Airline 1',
                            'Carrier Preference 1', 'Preferred Carrier 1', 'Airline Preference'],
    'airline_preference_2':['Airline Preference 2', 'Preferred Airline 2', 'Airline 2',
                            'Carrier Preference 2', 'Preferred Carrier 2'],
    'airline_preference_3':['Airline Preference 3', 'Preferred Airline 3', 'Airline 3',
                            'Carrier Preference 3', 'Preferred Carrier 3'],
    'frequent_flyer_number_1':['Rewards Number 1', 'Frequent Flyer 1', 'FF Number 1',
                            'Loyalty Number 1', 'Loyalty Program Number 1', 'Loyalty Program 1',
                            'Mileage Number 1', 'FF#1', 'Frequent Flyer Number'],
    'frequent_flyer_number_2':['Rewards Number 2', 'Frequent Flyer 2', 'FF Number 2',
                            'Loyalty Number 2', 'Loyalty Program Number 2', 'Loyalty Program 2', 'FF#2'],
    'frequent_flyer_number_3':['Rewards Number 3', 'Frequent Flyer 3', 'FF Number 3',
                            'Loyalty Number 3', 'Loyalty Program Number 3', 'Loyalty Program 3', 'FF#3'],
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
                 'Registration Details', 'Order Details', 'Flight Details',
                 'Travel Selections', 'Travel Selection', 'Flight Selections'],
}

SECTION_FIELDS = {
    'contact': ['prefix', 'first_name', 'middle_name', 'last_name', 'email_address',
                'cc_email_address', 'company', 'title', 'work_phone', 'home_phone',
                'mobile_phone', 'passport_number', 'passport_nationality',
                'passport_expiration_date', 'guest_email', 'guest_mobile_phone', 'guest_name'],
    'event':   ['event_code', 'event_title', 'event_date', 'event_time', 'group_id'],
    'request': ['request_name', 'request_date', 'full_name', 'gender', 'date_of_birth',
                'known_traveller_number', 'redress_number', 'age_category',
                'food_preferences', 'special_requests',
                'departure_time', 'departure_time_pref', 'departure_trip',
                'departure_airport', 'arrival_airport',
                'return_time', 'return_time_pref', 'return_trip',
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


def normalize_swoogo_format(text):
    """Swoogo emails use a two-level label syntax that our flat-label parser
    can't see: e.g. "Legal Name: First = Faamagalo" instead of "Legal First
    Name: Faamagalo". This rewrites those compound labels into the flat form
    the rest of the parser already understands.

    Also handles a few Swoogo-only stragglers:
      - "DOB:" lines (already aliased as date_of_birth, no change needed)
      - "Depature Date:" typo (handled via FIELD_ALIASES)
      - Stand-alone "Name:" with all-caps full name in plain-text header
    """
    if not text:
        return text

    # "Legal Name: First = Faamagalo"  →  "Legal First Name: Faamagalo"
    # "Legal Name: Middle = X"         →  "Legal Middle Name: X"
    # "Legal Name: Last = Potasi"      →  "Legal Last Name: Potasi"
    text = re.sub(
        r'Legal\s+Name\s*:\s*(First|Middle|Last)\s*=\s*',
        lambda m: f'Legal {m.group(1)} Name: ',
        text, flags=re.IGNORECASE,
    )

    # Bullet-style Swoogo lists often have orphan "Frequent Flyer 1:" and
    # "Preferred Airline 1:" sub-bullets that the parser already handles; no
    # extra work needed there.
    return text


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


_SECTION_HEADER_RE = re.compile(
    r'^[A-Z][A-Z0-9 /&,\-]{2,}$'  # ALL-CAPS line with at least one space (e.g. "TRAVEL SELECTIONS")
)


def _looks_like_section_header(line):
    if not line or len(line) < 5:
        return False
    if not _SECTION_HEADER_RE.match(line):
        return False
    # Must be a phrase (at least one space) and at least one alphabetic word
    if ' ' not in line:
        return False
    return True


def _collect_multiline_value(first_line, rest):
    parts = [first_line]
    for line in rest.split('\n'):
        stripped = line.strip()
        if not stripped:
            break
        if _starts_with_label(stripped):
            break
        if _looks_like_section_header(stripped):
            break
        parts.append(stripped)
    value = ' '.join(parts)
    value = re.sub(r'\s+', ' ', value).strip()
    # If the first_line itself absorbed a trailing section header on the
    # same physical line (e.g. "Female TRAVEL SELECTIONS"), trim it off.
    m = re.match(r'^(.+?)\s+([A-Z][A-Z0-9 /&,\-]{4,})$', value)
    if m and _looks_like_section_header(m.group(2).strip()):
        value = m.group(1).strip()
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


def _strip_trailing_empty_labels(value):
    """Strip trailing 'Label:' chains with no value glued onto a captured field.

    CVENT added Designation / Source ID rows to the contact table; when empty,
    the HTML->text flattening glues them to the previous value, producing e.g.
    last_name = 'Guenat Designation: Source ID:'. Repeatedly trim a trailing
    '<Word[ Word]>:' with nothing after it."""
    prev = None
    while prev != value:
        prev = value
        value = re.sub(r'\s*[A-Za-z][A-Za-z .#/]{0,30}:\s*$', '', value).strip()
    return value


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
        value = _strip_trailing_empty_labels(value)
        if value and not is_junk(value) and not has_signature_text(value):
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
    PARSER_VERSION = '3.0-date-time-split'

    text = clean_html_to_text(html_email_body)
    text = normalize_swoogo_format(text)
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

    # ── Whole-text fallback ─────────────────────────────────────────────────
    # Some platforms (notably Swoogo) put fields in unexpected sections — DOB
    # and Gender appear under PASSENGER DETAILS rather than the travel block.
    # For any field still empty after section-based extraction, retry against
    # the entire email text so we don't miss values that landed in the "wrong"
    # section. Sectioned extraction stays the primary path; this is rescue-only.
    for section_key, fields in SECTION_FIELDS.items():
        for field in fields:
            if output.get(field):
                continue
            if field in ('email_address', 'cc_email_address', 'guest_email'):
                output[field] = extract_email(text, field)
                continue
            if field in ('first_name', 'last_name', 'middle_name', 'mobile_phone'):
                output[field] = extract_field(text, field, exclude_prefixes=GUEST_EXCLUDE)
            else:
                output[field] = extract_field(text, field)

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

    # ── Guest bookings: the traveller's name wins ────────────────────────────
    # The Contact Information block is the BOOKER; Request Details' "Full Name"
    # is the person actually travelling (e.g. Kristy Ward booking for guest
    # Mary Stevens). When first+last clearly differ, use the Full Name as the
    # traveller's first/middle/last so the master row names the right person.
    _fn = (output.get('full_name') or '').strip()
    _fn_parts = _fn.split()
    if len(_fn_parts) >= 2:
        _c_first = (output.get('first_name') or '').strip().lower()
        _c_last = (output.get('last_name') or '').strip().lower()
        _g_first, _g_last = _fn_parts[0].lower(), _fn_parts[-1].lower()
        if (_c_first or _c_last) and _g_first != _c_first and _g_last != _c_last:
            output['first_name'] = _fn_parts[0]
            output['last_name'] = _fn_parts[-1]
            if len(_fn_parts) >= 3:
                output['middle_name'] = ' '.join(_fn_parts[1:-1])
            # Surface the guest explicitly too (Vera's Guest Name column).
            if not output.get('guest_name'):
                output['guest_name'] = _fn

    # ── Group ID sanitization ───────────────────────────────────────────────────
    # Group IDs are compact alphanumeric codes (e.g. "1OEGLOASEP26"). If the
    # extractor bled into adjacent text (e.g. "1OEGLOASEP26 Registrant Type: Veteran"),
    # strip everything past the first space.
    if output.get('group_id'):
        m = re.match(r'([A-Z0-9]{4,20})', output['group_id'].strip(), re.IGNORECASE)
        if m:
            output['group_id'] = m.group(1).upper()

    # ── Swoogo airport → route combining ───────────────────────────────────────
    # Swoogo gives Departure Airport + Arrival Airport as separate fields.
    # If departure_trip is still empty, build a route string from those two.
    dep_apt = output.get('departure_airport', '').strip()
    arr_apt = output.get('arrival_airport', '').strip()
    if dep_apt or arr_apt:
        if not output.get('departure_trip'):
            if dep_apt and arr_apt:
                output['departure_trip'] = f'{dep_apt} → {arr_apt}'
            elif dep_apt:
                output['departure_trip'] = dep_apt
            elif arr_apt:
                output['departure_trip'] = arr_apt

    # Departure date and the time-of-day window are kept in SEPARATE fields:
    #   departure_time      → the DATE        → master "Departure Time" column
    #   departure_time_pref → the window      → master "Departure Preference" column
    # (CVENT + Agent copy have no preference column, so write_to_smartsheet
    # recombines them into "DATE (window)" for those two sheets only.)

    # Return is handled the same way as departure: return_time holds the DATE
    # (master "Return Date" column) and return_time_pref holds the time-of-day
    # window (master "Return Time" column). CVENT + Agent copy have only one
    # return column, so write_to_smartsheet recombines them for those sheets.

    # Group ID fallback: Swoogo puts it in the subject after a pipe,
    # e.g. "War Heroes on Water 2026 | 1OEGLOASEP26". The body also has
    # "Kensington Group ID: 1OEGLOASEP26" which the alias should catch,
    # but the subject fallback covers any template that drops it from body.
    if not output.get('group_id') and email_subject:
        # Match Kensington-style group IDs: 4-12 uppercase alphanumeric chars
        # often containing trailing digits, after a pipe or "ID:" marker.
        m = re.search(r'(?:\||ID\s*:?\s*)\s*([A-Z0-9]{6,16})\b', email_subject)
        if m:
            output['group_id'] = m.group(1).strip()

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

    # A row is only worth writing if we have a NAME. Email alone is not
    # enough — the fallback email extractor will happily pick up emails
    # from quoted reply threads, footers, signatures, etc., which would
    # otherwise spawn junk rows that have nothing but an email address.
    has_name = bool(
        output.get('first_name') or output.get('last_name') or output.get('full_name')
    )
    has_email = bool(output.get('email_address'))
    has_identity = has_name and has_email

    if not has_identity:
        output['should_process'] = False
        output['source_form'] = source_form if source_form != 'Unknown' else 'Empty Extraction'
        output['confidence_score'] = 0
        output['needs_review'] = True
        if not has_name and has_email:
            output['detection_reason'] = f'{detection_reason}; email_only_no_name'
        elif has_name and not has_email:
            output['detection_reason'] = f'{detection_reason}; name_only_no_email'
        else:
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
    # Group ID is the FIRST column on the CVENT sheet (2026-07-08: its old
    # =[Event Code]@row column formula was cleared, so it's writable now).
    # The parser reads it from the email's "Event ID:" / "Group ID:" /
    # "Kensington Group ID:" line.
    'group_id':                 6407673733222276,
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
    # NOTE: Group ID on the CVENT sheet has column formula =[Event Code]@row,
    # so it's read-only via API. Master + Agent copy receive group_id directly.
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
# Maps parser output fields → Traveller Profile MasterSheet column IDs.
# NOTE: omits `source_form` and `age_category` — those columns don't exist on
# this sheet. `Source` is supplied separately via master_extra below, set to
# 'CVENT' for parser-fed rows. Including them caused every CVENT write to be
# rejected with INVALID_COLUMN_ID 1036, so the master sheet had 0 CVENT rows.
MASTER_COLUMN_MAP = {
    'first_name':               5726513277472644,
    'middle_name':              3474713463787396,
    'last_name':                7978313091157892,
    'date_of_birth':            659963696680836,
    'gender':                   5163563324051332,
    'nationality':              2911763510366084,
    'email_address':            7415363137736580,
    'cc_email_address':         8662414441877380,
    'mobile_phone':             1785863603523460,   # Phone Number (Mobile Phone column retired/merged)
    'work_phone':               2751439930953604,
    'home_phone':               7255039558324100,
    'company':                  6289463230893956,
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
    'group_id':                 5029597388509060,
    'request_name':             8943889418588036,
    'request_date':             42243280113540,
    # NOTE: 'full_name' (was 4545842907484036) intentionally omitted — that
    # column was removed from the master sheet, so writing it returns
    # INVALID_COLUMN_ID 1036 and rejects the whole row. First/Middle/Last
    # cover the name; full_name is not needed on the master.
    'known_traveller_number':   652472233529220,    # "Global Entry Number" (consolidated; the old "Known Traveller Number" col 8259788067868548 was deleted)
    'redress_number':           3756188440498052,    # "Redress Number" column (separate from KTN)
    'departure_time':           6797642721169284,   # "Departure Date" column (holds the date)
    'departure_time_pref':      2117685625524100,   # "Departure Time" column (time-of-day window)
    'departure_trip':           4882088347340676,   # "Departure City" (old "Departure Trip" col 1168143186956164 was deleted)
    'return_time':              5671742814326660,    # "Return Date" column (holds the date)
    'return_time_pref':         5554005685342084,    # "Return Time" column (time-of-day window)
    'return_trip':              3419943000641412,
    'ticket_type':              7923542628011908,
    'seating':                  2630288533655428,   # "Seat Preference" (old "Seating" col 605193233534852 was deleted)
    'food_preferences':         2856993047220100,
    'special_requests':         7360592674590596,
    'reservation_status':       1731093140377476,
    'airline_preference_1':     6234692767747972,
    'frequent_flyer_number_1':  3982892954062724,
    'airline_preference_2':     8486492581433220,
    'frequent_flyer_number_2':  323718256824196,
    'airline_preference_3':     4827317884194692,
    'frequent_flyer_number_3':  2575518070509444,
    'confidence_score':         7642067651301252,
}


# Original date columns + their KCG Agent copy equivalents (so the mirror
# write normalizes dates too).
DATE_COLUMNS = {659963696680836, 8541263044579204, 2067338580234116,
                5361101532598148, 153814463451012, 7472163857928068}

# "Copy of Traveller Profile MasterSheet" in the KCG Agent workspace. Copying
# the sheet gave it new sheet + column IDs, so this maps every original master
# column ID -> the copy's equivalent (matched by column title).
TRAVELLER_COPY_SHEET_ID = '7213505705889668'
TRAVELLER_ORIG_TO_COPY = {
    5726513277472644: 2546351765491588,  # First Name
    3474713463787396: 7049951392862084,  # Middle Name
    7978313091157892: 1420451858648964,  # Last Name
    659963696680836:  5361101532598148,  # Date of Birth
    5163563324051332: 3109301718912900,  # Gender
    2911763510366084: 7612901346283396,  # Nationality
    7415363137736580: 1983401812070276,  # Email Address
    8662414441877380: 1842664323714948,  # CC Email Address
    1785863603523460: 6487001439440772,  # Phone Number (Mobile Phone merged in)
    2751439930953604: 4094464137400196,  # Work Phone
    7255039558324100: 8598063764770692,  # Home Phone
    6289463230893956: 4235201625755524,  # Company Name
    5003239744638852: 6346263951085444,  # Title
    4037663417208708: 8738801253126020,  # Passport Number
    8541263044579204: 153814463451012,   # Passport Expiry Date
    6129139651481476: 4938889067532164,  # Passport Nationality
    5566189698060164: 6064788974374788,  # Guest Email Address
    3314389884374916: 3812989160689540,  # Guest Mobile Phone
    7817989511745412: 8316588788060036,  # Event Code
    2188489977532292: 998239393582980,   # Event Title
    6692089604902788: 5501839020953476,  # Event Date
    4440289791217540: 3250039207268228,  # Event Time
    5029597388509060: 3953726649044868,  # Group ID
    8943889418588036: 7753638834638724,  # Request Name
    42243280113540:   2124139300425604,  # Request Date
    4545842907484036: 6627738927796100,  # Full Name
    3756188440498052: 8035113811349380,  # Redress Number
    6797642721169284: 8879538741481348,  # Departure Time
    1168143186956164: 83445719273348,    # Departure Trip
    5671742814326660: 4587045346643844,  # Return Time
    3419943000641412: 2335245532958596,  # Return Trip
    7923542628011908: 6838845160329092,  # Ticket Type
    605193233534852:  1209345626115972,  # Seating
    5108792860905348: 5712945253486468,  # Age Category
    2856993047220100: 3461145439801220,  # Food Preferences
    7360592674590596: 7964745067171716,  # Special Requests
    1731093140377476: 646395672694660,   # Reservation Status
    6234692767747972: 5149995300065156,  # Airline Preference 1
    3982892954062724: 2898195486379908,  # Rewards Number 1
    8486492581433220: 7401795113750404,  # Airline Preference 2
    323718256824196:  1772295579537284,  # Rewards Number 2
    4827317884194692: 6275895206907780,  # Airline Preference 3
    2575518070509444: 4024095393222532,  # Rewards Number 3
    3138468023930756: 5994420230197124,  # Source Form
    7642067651301252: 3742620416511876,  # Confidence Score
    6155241207926660: 8457326276415364,  # Source
}

def _normalize_date_for_smartsheet(val):
    if not val:
        return val
    for fmt in ('%m/%d/%Y', '%d/%m/%Y', '%Y-%m-%d', '%m-%d-%Y', '%d-%m-%Y',
                '%b %d, %Y', '%B %d, %Y', '%d %b %Y', '%d %B %Y',
                '%d-%b-%Y', '%d-%B-%Y', '%b-%d-%Y', '%B-%d-%Y'):
        try:
            from datetime import datetime
            dt = datetime.strptime(val.strip(), fmt)
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            continue
    return val

def _consolidate_master_cells(cells):
    """Fold retired/duplicate Traveller-master columns into their kept destination."""
    RETIRE = {
        323718256824196: 3982892954062724, 2575518070509444: 3982892954062724,
        8259788067868548: 652472233529220, 2294043093798788: 652472233529220,
        5156071860899716: 7133888161025924, 2856993047220100: 7133888161025924,
        42243280113540: 2067338580234116,
        1168143186956164: 4882088347340676,
        605193233534852: 2630288533655428,
        2904272047214468: 1504388626812804,
        6129139651481476: 2911763510366084,
    }
    DESTS = {3982892954062724, 652472233529220, 7133888161025924, 2067338580234116,
             4882088347340676, 2630288533655428, 1504388626812804, 2911763510366084}
    DATE_DEST = 2067338580234116
    passthrough, buckets, order = [], {}, []
    for c in cells:
        cid = c.get('columnId')
        dest = RETIRE.get(cid, cid)
        if dest in DESTS:
            if dest not in buckets:
                buckets[dest] = []
                order.append(dest)
            buckets[dest].append(c.get('value'))
        else:
            passthrough.append(c)
    out = list(passthrough)
    for dest in order:
        if dest == DATE_DEST:
            v = next((x for x in buckets[dest] if x not in (None, '')), None)
            if v not in (None, ''):
                out.append({'columnId': dest, 'value': _normalize_date_for_smartsheet(v)})
        else:
            seen, parts = set(), []
            for v in buckets[dest]:
                s = ('' if v is None else str(v)).strip()
                if s and s.lower() not in seen:
                    seen.add(s.lower())
                    parts.append(s)
            if parts:
                out.append({'columnId': dest, 'value': '; '.join(parts)})
    return out


_LIVE_COLS_CACHE = {}


def _live_column_ids(token, sheet_id):
    """Column ids that actually exist on the sheet right now (cached per run).

    Agents delete/recreate master columns, and ONE stale id in the map rejects
    the ENTIRE row (INVALID_COLUMN_ID 1036). This bit us 2026-07-08: 16 dead
    master ids meant every CVENT traveller silently never reached the master.
    Filtering cells to live ids makes writes self-healing — a deleted column
    costs that one field, never the whole row. Returns None on lookup failure
    (caller then writes unfiltered, same as before)."""
    key = str(sheet_id)
    if key in _LIVE_COLS_CACHE:
        return _LIVE_COLS_CACHE[key]
    req = Request(
        f'https://api.smartsheet.com/2.0/sheets/{sheet_id}?pageSize=1',
        headers={'Authorization': f'Bearer {token}'},
    )
    try:
        data = json.loads(urlopen(req).read().decode())
        # Exclude column-formula columns too: writing to one rejects the whole
        # row just like a dead id (e.g. the CVENT sheet's Group ID column while
        # it still carried the =[Event Code]@row formula).
        ids = {c['id'] for c in data.get('columns', []) if not c.get('formula')}
        _LIVE_COLS_CACHE[key] = ids
        return ids
    except Exception:
        _LIVE_COLS_CACHE[key] = None
        return None


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
    if str(sheet_id) == str(MASTER_SHEET_ID):
        cells = _consolidate_master_cells(cells)
    live = _live_column_ids(token, sheet_id)
    if live is not None:
        cells = [c for c in cells if c['columnId'] in live]
    if not cells:
        return 'skipped — no data'
    # Append new rows at the BOTTOM, not the top. Inserting at top shifts every
    # existing row down by one, which looked like the whole sheet "moving" every
    # time a registration came in. Bottom-append leaves existing rows in place.
    payload = json.dumps([{'toBottom': True, 'cells': cells}]).encode()
    # Single attempt only. Do NOT retry here, and do NOT raise to the caller:
    # the parser must always return 200 to Power Automate, otherwise PA's HTTP
    # connector auto-retries and we get duplicate rows in both sheets.
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


def _send_failure_alert(parsed, cvent_result, master_result):
    """
    Sends a Teams notification when CVENT parser fails to write to Smartsheet.
    Set TEAMS_WEBHOOK_URL env var in Vercel to enable.
    """
    webhook_url = os.environ.get('TEAMS_WEBHOOK_URL', '')
    if not webhook_url:
        return  # alerting disabled

    name = ' '.join(filter(None, [
        parsed.get('first_name', ''),
        parsed.get('last_name', '')
    ])) or 'Unknown'
    email = parsed.get('email_address', 'N/A')

    # Teams Adaptive Card format
    card = {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "summary": "CVENT Parser Failure",
        "themeColor": "FF6B6B",
        "title": "⚠️ CVENT Parser Write Failed",
        "sections": [{
            "activityTitle": f"Traveller: **{name}**",
            "activitySubtitle": f"Email: {email}",
            "facts": [
                {"name": "CVENT Sheet", "value": cvent_result},
                {"name": "Master Sheet", "value": master_result},
            ],
            "text": "Check Vercel logs and Power Automate run history for details."
        }]
    }

    try:
        req = Request(webhook_url, data=json.dumps(card).encode(), headers={'Content-Type': 'application/json'}, method='POST')
        urlopen(req, timeout=5)
    except Exception as e:
        # Don't crash the whole parser if alerting fails
        print(f'Teams alert failed: {e}')


# ── Duplicate protection ────────────────────────────────────────────────────
# A registration is considered the SAME person+event if the email matches and
# the event matches. We key on email + (event_code OR event_title OR name) so
# the same person registering for two DIFFERENT events still creates two rows,
# but the identical registration arriving twice (e.g. from both the USA and
# Canada inboxes, or a re-sent/forwarded confirmation) only writes once.
_DEDUP_COLS = {
    'email_address': 6621390836109188,
    'event_code':    2891847394692996,
    'event_title':   7395447022063492,
    'full_name':     358572604297092,
    'first_name':    5495490929266564,
    'last_name':     7747290742951812,
}


def _clean_key_part(s):
    if not s:
        return ''
    # strip the zero-width space the form/parser may append, plus whitespace/case
    return str(s).replace('​', '').strip().lower()


def _dedup_key(email, event_code, event_title, full_name, first_name, last_name):
    email = _clean_key_part(email)
    if not email:
        return None  # no email → cannot dedup reliably; let it write
    code = _clean_key_part(event_code)
    if code:
        return f'{email}|code:{code}'
    title = _clean_key_part(event_title)
    if title:
        return f'{email}|title:{title}'
    name = _clean_key_part(full_name) or _clean_key_part(
        (first_name or '') + ' ' + (last_name or '')
    )
    return f'{email}|name:{name}'


def _fetch_existing_dedup_keys(token, sheet_id):
    """Return a set of dedup keys already present in the CVENT sheet.
    Fails OPEN (returns empty set) on any error so a lookup hiccup never
    blocks a legitimate registration from being written."""
    col_ids = ','.join(str(c) for c in _DEDUP_COLS.values())
    url = (f'https://api.smartsheet.com/2.0/sheets/{sheet_id}'
           f'?columnIds={col_ids}&level=0')
    try:
        req = Request(url, headers={'Authorization': f'Bearer {token}'})
        resp = urlopen(req, timeout=10)
        data = json.loads(resp.read().decode())
    except Exception as e:
        print(f'Dedup lookup failed (failing open): {e}')
        return set()

    id_to_field = {v: k for k, v in _DEDUP_COLS.items()}
    keys = set()
    for row in data.get('rows', []):
        vals = {}
        for cell in row.get('cells', []):
            field = id_to_field.get(cell.get('columnId'))
            if field:
                vals[field] = cell.get('value', '')
        key = _dedup_key(
            vals.get('email_address'), vals.get('event_code'),
            vals.get('event_title'), vals.get('full_name'),
            vals.get('first_name'), vals.get('last_name'),
        )
        if key:
            keys.add(key)
    return keys


def _find_row_by_email(token, sheet_id, email_col_id, email):
    """Return the first row ID in sheet_id where email_col_id == email, or None.
    Tries a column-filtered fetch first; falls back to full sheet scan if the
    filtered response returns no matching cells (can happen with CONTACT_LIST
    columns where value is stored as an object rather than a plain string)."""
    email_lower = email.strip().lower()

    def _scan_rows(rows):
        for row in rows:
            for cell in row.get('cells', []):
                if cell.get('columnId') == email_col_id:
                    val = (cell.get('value') or cell.get('displayValue') or '')
                    if str(val).strip().lower() == email_lower:
                        return row['id']
        return None

    # First attempt: column-filtered (fast)
    try:
        url = (f'https://api.smartsheet.com/2.0/sheets/{sheet_id}'
               f'?columnIds={email_col_id}&level=1')
        req = Request(url, headers={'Authorization': f'Bearer {token}'})
        resp = urlopen(req, timeout=10)
        data = json.loads(resp.read().decode())
        hit = _scan_rows(data.get('rows', []))
        if hit:
            return hit
    except Exception as e:
        print(f'Row lookup (filtered) failed: {e}')

    # Fallback: full sheet fetch — needed when filtered API drops contact-type cells
    try:
        url = f'https://api.smartsheet.com/2.0/sheets/{sheet_id}?level=1'
        req = Request(url, headers={'Authorization': f'Bearer {token}'})
        resp = urlopen(req, timeout=15)
        data = json.loads(resp.read().decode())
        return _scan_rows(data.get('rows', []))
    except Exception as e:
        print(f'Row lookup (full) failed: {e}')
        return None


def _update_row(token, sheet_id, row_id, column_map, parsed, extra_cells=None):
    """PUT (update) an existing row with all non-empty fields."""
    cells = []
    for field, col_id in column_map.items():
        val = parsed.get(field, '')
        if val != '' and val is not None:
            if col_id in DATE_COLUMNS:
                val = _normalize_date_for_smartsheet(val)
            cells.append({'columnId': col_id, 'value': val})
    if extra_cells:
        cells.extend(extra_cells)
    if str(sheet_id) == str(MASTER_SHEET_ID):
        cells = _consolidate_master_cells(cells)
    live = _live_column_ids(token, sheet_id)
    if live is not None:
        cells = [c for c in cells if c['columnId'] in live]
    if not cells:
        return 'skipped — no data'
    payload = json.dumps([{'id': row_id, 'cells': cells}]).encode()
    req = Request(
        f'https://api.smartsheet.com/2.0/sheets/{sheet_id}/rows',
        data=payload,
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        },
        method='PUT',
    )
    try:
        resp = urlopen(req)
        return f'updated ({resp.status})'
    except Exception as e:
        detail = ''
        if hasattr(e, 'read'):
            try:
                detail = e.read().decode()
            except Exception:
                pass
        return f'error: {str(e)} | {detail}'


def write_to_smartsheet(parsed, force=False):
    token = os.environ.get('SMARTSHEET_API_TOKEN', '')
    if not token:
        return {'cvent_sheet': 'skipped — no token', 'master_sheet': 'skipped — no token'}

    # The master sheet has separate "Departure Time" (date) and "Departure
    # Preference" (time-of-day window) columns. CVENT and the Agent copy only
    # have one "Departure Time" column, so for those two we recombine the date
    # and window into "DATE (window)" so no information is lost there.
    def _combine(date_val, pref_val):
        d = (date_val or '').strip()
        p = (pref_val or '').strip()
        if d and p:
            return f'{d} ({p})'
        return d or p
    parsed_combined = dict(parsed)
    parsed_combined['departure_time'] = _combine(parsed.get('departure_time'), parsed.get('departure_time_pref'))
    parsed_combined['return_time'] = _combine(parsed.get('return_time'), parsed.get('return_time_pref'))

    # ── Duplicate check (against the CVENT sheet, the source of truth) ──
    new_key = _dedup_key(
        parsed.get('email_address'), parsed.get('event_code'),
        parsed.get('event_title'), parsed.get('full_name'),
        parsed.get('first_name'), parsed.get('last_name'),
    )

    if force and parsed.get('email_address'):
        # Force-repost: find existing rows and UPDATE them instead of creating dupes
        email = parsed['email_address']
        cvent_row_id = _find_row_by_email(token, CVENT_SHEET_ID, _DEDUP_COLS['email_address'], email)
        master_row_id = _find_row_by_email(token, MASTER_SHEET_ID, MASTER_COLUMN_MAP['email_address'], email)
        copy_email_col = TRAVELLER_ORIG_TO_COPY.get(MASTER_COLUMN_MAP['email_address'])
        copy_row_id = _find_row_by_email(token, TRAVELLER_COPY_SHEET_ID, copy_email_col, email) if copy_email_col else None

        master_extra = [{'columnId': 6155241207926660, 'value': 'CVENT'}]
        copy_map = {f: TRAVELLER_ORIG_TO_COPY[c] for f, c in MASTER_COLUMN_MAP.items()
                    if c in TRAVELLER_ORIG_TO_COPY}
        copy_extra = [{'columnId': TRAVELLER_ORIG_TO_COPY[6155241207926660], 'value': 'CVENT'}]

        if cvent_row_id:
            cvent_result = _update_row(token, CVENT_SHEET_ID, cvent_row_id, CVENT_COLUMN_MAP, parsed_combined)
        else:
            cvent_result = _write_rows(token, CVENT_SHEET_ID, CVENT_COLUMN_MAP, parsed_combined)

        if master_row_id:
            master_result = _update_row(token, MASTER_SHEET_ID, master_row_id, MASTER_COLUMN_MAP, parsed, master_extra)
        else:
            master_result = _write_rows(token, MASTER_SHEET_ID, MASTER_COLUMN_MAP, parsed, master_extra)

        if copy_row_id:
            copy_result = _update_row(token, TRAVELLER_COPY_SHEET_ID, copy_row_id, copy_map, parsed_combined, copy_extra)
        else:
            copy_result = _write_rows(token, TRAVELLER_COPY_SHEET_ID, copy_map, parsed_combined, copy_extra)

        ok = (str(cvent_result).startswith('ok') or str(cvent_result).startswith('updated')) and \
             (str(master_result).startswith('ok') or str(master_result).startswith('updated'))
        return {'cvent_sheet': cvent_result, 'master_sheet': master_result, 'copy_sheet': copy_result, 'ok': ok, 'forced': True}

    if new_key:
        existing_keys = _fetch_existing_dedup_keys(token, CVENT_SHEET_ID)
        if new_key in existing_keys:
            return {
                'cvent_sheet': 'skipped — duplicate',
                'master_sheet': 'skipped — duplicate',
                'copy_sheet': 'skipped — duplicate',
                'duplicate_key': new_key,
                'ok': True,  # a duplicate is a successful no-op, not a failure
            }

    cvent_result = _write_rows(token, CVENT_SHEET_ID, CVENT_COLUMN_MAP, parsed_combined)

    master_extra = [
        {'columnId': 6155241207926660, 'value': 'CVENT'},
    ]
    master_result = _write_rows(token, MASTER_SHEET_ID, MASTER_COLUMN_MAP, parsed, master_extra)

    # Mirror the master row into the KCG Agent copy (translate column IDs).
    copy_map = {f: TRAVELLER_ORIG_TO_COPY[c] for f, c in MASTER_COLUMN_MAP.items()
                if c in TRAVELLER_ORIG_TO_COPY}
    copy_extra = [{'columnId': TRAVELLER_ORIG_TO_COPY[6155241207926660], 'value': 'CVENT'}]
    copy_result = _write_rows(token, TRAVELLER_COPY_SHEET_ID, copy_map, parsed_combined, copy_extra)

    # 'ok' intentionally ignores the copy mirror: a copy hiccup must not make
    # the parser return non-200 (which would trigger Power Automate retries).
    ok = str(cvent_result).startswith('ok') and str(master_result).startswith('ok')

    # Alert on failure
    if not ok:
        _send_failure_alert(parsed, cvent_result, master_result)

    return {
        'cvent_sheet': cvent_result,
        'master_sheet': master_result,
        'copy_sheet': copy_result,
        # True only if BOTH sheets accepted the row. Lets the HTTP handler
        # surface a partial failure instead of swallowing it silently.
        'ok': ok,
    }


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

            force = bool(data.get('force') or data.get('Force'))
            result = parse_email(html_email_body, email_subject)

            if result.get('should_process'):
                ss_result = write_to_smartsheet(result, force=force)
                result['smartsheet_write'] = ss_result
                # Always return 200 — even on a partial write failure. Returning
                # a non-200 makes Power Automate's HTTP connector auto-retry,
                # which re-runs the parser and creates DUPLICATE rows. Failures
                # are reported in result['smartsheet_write'] for inspection.

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
