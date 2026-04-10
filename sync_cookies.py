import os
import subprocess

def sync_cookies(browser_name="chrome"):
    """
    Requirements: pip install browser-cookie3
    """
    try:
        import browser_cookie3
    except ImportError:
        print("Missing required library. Installing browser-cookie3...")
        subprocess.run(["pip", "install", "browser-cookie3"], check=True)
        import browser_cookie3

    print(f"Extracting YouTube cookies from your local {browser_name} browser...")
    try:
        if browser_name.lower() == "chrome":
            cj = browser_cookie3.chrome(domain_name='.youtube.com')
        elif browser_name.lower() == "firefox":
            cj = browser_cookie3.firefox(domain_name='.youtube.com')
        elif browser_name.lower() == "edge":
            cj = browser_cookie3.edge(domain_name='.youtube.com')
        elif browser_name.lower() == "safari":
            cj = browser_cookie3.safari(domain_name='.youtube.com')
        else:
            cj = browser_cookie3.load(domain_name='.youtube.com')
            
    except Exception as e:
        print(f"Failed to load cookies: {e}")
        print("Ensure your browser is installed and you are logged into YouTube.")
        return

    # Write to Netscape format
    with open("cookies.txt", "w") as f:
        f.write("# Netscape HTTP Cookie File\n")
        f.write("# This file was automatically generated\n")
        count = 0
        for cookie in cj:
            # Force expiration logic since browser-cookie3 can return None
            expires = cookie.expires if cookie.expires else 2147483647
            f.write(f"{cookie.domain}\tTRUE\t{cookie.path}\t{'TRUE' if cookie.secure else 'FALSE'}\t{expires}\t{cookie.name}\t{cookie.value}\n")
            count += 1
            
    if count == 0:
        print("No YouTube cookies found! Are you logged into YouTube on this browser?")
        return

    print(f"Successfully extracted {count} cookies.")
    print("Pushing cookies.txt instantly to Google Cloud Secret Manager...")
    try:
        subprocess.run([
            "gcloud", "secrets", "versions", "add", "ytdlp-cookies",
            "--data-file=cookies.txt"
        ], check=True)
        print("✅ Success! The GPU workers will instantly use these new authenticated cookies on their next download.")
    except Exception as e:
        print(f"❌ Failed to push to GCP: {e}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--browser", default="chrome", help="Browser to extract cookies from (chrome, firefox, edge, safari, all)")
    args = parser.parse_args()
    
    sync_cookies(args.browser)
