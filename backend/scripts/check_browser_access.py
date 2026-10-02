"""Check a deployed API using the actual browser CORS handshake.
Usage: python backend/scripts/check_browser_access.py --api https://samudra-1.onrender.com/api/v1
"""
import argparse
import sys
import httpx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", required=True, help="API base URL ending /api/v1")
    parser.add_argument("--origin", default="https://orca-qxx1.vercel.app")
    args = parser.parse_args()
    failed = False
    with httpx.Client(timeout=30) as client:
        for path, method in [("/health", "GET"), ("/layers/base", "GET"),
                             ("/demo/vessels", "GET"), ("/spatial/query", "POST")]:
            try:
                response = client.options(args.api.rstrip("/") + path, headers={
                    "Origin": args.origin, "Access-Control-Request-Method": method,
                    "Access-Control-Request-Headers": "content-type,x-request-id",
                })
                allowed = response.status_code == 200 and response.headers.get("access-control-allow-origin") == args.origin
                print(f"{'PASS' if allowed else 'FAIL'} preflight {method} {path}: {response.status_code}")
                failed |= not allowed
            except httpx.HTTPError as exc:
                print(f"FAIL preflight {path}: {type(exc).__name__}")
                failed = True
        try:
            response = client.get(args.api.rstrip("/") + "/health", headers={"Origin": args.origin})
            allowed = response.status_code == 200 and response.headers.get("access-control-allow-origin") == args.origin
            print(f"{'PASS' if allowed else 'FAIL'} browser health: {response.status_code}")
            failed |= not allowed
            if response.status_code == 200:
                payload = response.json()
                print("Deployment:", payload.get("deployment", {}), "mode:", payload.get("data_mode"))
        except (httpx.HTTPError, ValueError) as exc:
            print(f"FAIL health: {type(exc).__name__}")
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
