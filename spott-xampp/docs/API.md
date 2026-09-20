# Spott API Notes

The website uses PHP JSON endpoints under `api/`. Browser requests are made with `fetch()` and update the interface without a full-page reload.

## Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `api/events.php` | Returns active events and applies search/filter parameters. |
| GET | `api/categories.php` | Returns categories used by the filter dropdown. |
| POST | `api/register.php` | Saves the demo attendee's RSVP in MySQL. |
| POST | `api/confirm.php` | Updates the event's still-happening confirmation timestamp. |
| POST | `api/report.php` | Creates a report for administrator review. |

## Event filters

`api/events.php` accepts `q`, `category`, `city`, `date`, and `max_price`. It joins events, organizers, locations, categories, and registrations so the frontend receives the event card data in one response.

## Example request

```text
GET /spott-xampp/api/events.php?q=music&city=Dasmariñas&max_price=300
```

## Example response shape

```json
{
  "success": true,
  "count": 1,
  "events": [
    {
      "event_id": 1,
      "title": "Campus Music Night",
      "city": "Dasmariñas",
      "price": "150.00",
      "registrations": 0
    }
  ]
}
```

## Data flow

1. `assets/app.js` reads the search and filter controls.
2. `fetch()` sends the selected parameters to `api/events.php`.
3. PHP uses PDO prepared statements to query MySQL.
4. The JSON response is rendered into event cards and map-location cards.
5. RSVP, confirmation, and reporting actions send JSON `POST` requests and show the returned status message.
