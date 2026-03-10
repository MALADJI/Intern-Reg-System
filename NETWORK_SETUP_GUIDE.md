# Network Setup Guide - Private Network Access

This guide explains how to make your Intern Register System accessible on a private network so that anyone connected to your network can use it.

## ✅ What Has Been Configured

### Frontend Configuration
- **Angular Dev Server**: Already configured to listen on `0.0.0.0:4200`
  - This means the frontend accepts connections from any network interface
  - Configuration is in `angular.json` and `package.json`

### Backend API Configuration
- **Dynamic API URL**: The frontend now automatically detects the backend URL based on the current hostname
  - If accessed via `localhost`, it uses `http://localhost:8082/api`
  - If accessed via network IP (e.g., `192.168.1.100`), it uses `http://192.168.1.100:8082/api`
  - Configuration is in `src/app/services/api.service.ts`

## 📋 Setup Instructions

### Step 1: Find Your Computer's IP Address

#### On Windows:
1. Open Command Prompt or PowerShell
2. Run: `ipconfig`
3. Look for "IPv4 Address" under your active network adapter (usually "Wireless LAN adapter Wi-Fi" or "Ethernet adapter")
4. Note the IP address (e.g., `192.168.1.100`)

#### On macOS/Linux:
1. Open Terminal
2. Run: `ifconfig` or `ip addr`
3. Look for your network interface (usually `en0` for Wi-Fi or `eth0` for Ethernet)
4. Find the `inet` address (e.g., `192.168.1.100`)

### Step 2: Configure Your Backend Server

**IMPORTANT**: Your backend server must also be configured to accept connections from the network, not just localhost.

#### If using Spring Boot (Java):
- Update `application.properties` or `application.yml`:
  ```properties
  server.address=0.0.0.0
  server.port=8082
  ```
- Or run with: `java -jar your-app.jar --server.address=0.0.0.0`

#### If using Node.js/Express:
- Update your server configuration:
  ```javascript
  app.listen(8082, '0.0.0.0', () => {
    console.log('Server running on 0.0.0.0:8082');
  });
  ```

#### If using Python/Flask:
- Update your server configuration:
  ```python
  app.run(host='0.0.0.0', port=8082)
  ```

### Step 3: Configure Windows Firewall

#### Allow Frontend (Port 4200):
1. Open Windows Defender Firewall
2. Click "Advanced settings"
3. Click "Inbound Rules" → "New Rule"
4. Select "Port" → Next
5. Select "TCP" and enter port `4200` → Next
6. Select "Allow the connection" → Next
7. Check all profiles (Domain, Private, Public) → Next
8. Name it "Angular Dev Server" → Finish

#### Allow Backend (Port 8082):
1. Repeat the above steps for port `8082`
2. Name it "Backend API Server"

**Quick PowerShell Method** (Run as Administrator):
```powershell
New-NetFirewallRule -DisplayName "Angular Dev Server" -Direction Inbound -LocalPort 4200 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Backend API Server" -Direction Inbound -LocalPort 8082 -Protocol TCP -Action Allow
```

### Step 4: Start Your Servers

1. **Start Backend Server** (on port 8082):
   ```bash
   # Make sure it's configured to listen on 0.0.0.0:8082
   ```

2. **Start Frontend Server**:
   ```bash
   npm start
   # or
   ng serve --host 0.0.0.0 --port 4200
   ```

### Step 5: Access from Other Devices

#### From the Host Computer:
- Frontend: `http://localhost:4200`
- Backend: `http://localhost:8082/api`

#### From Other Devices on the Same Network:
- Frontend: `http://YOUR_IP_ADDRESS:4200` (e.g., `http://192.168.1.100:4200`)
- Backend: The frontend will automatically use `http://YOUR_IP_ADDRESS:8082/api`

**Example:**
If your computer's IP is `192.168.1.100`:
- Other devices should access: `http://192.168.1.100:4200`
- The frontend will automatically connect to: `http://192.168.1.100:8082/api`

## 🔍 Troubleshooting

### Issue: Cannot access from other devices
**Solutions:**
1. Verify both servers are running
2. Check Windows Firewall rules are created
3. Ensure devices are on the same network
4. Verify your IP address hasn't changed (check with `ipconfig`)
5. Try accessing from the host computer using the IP address first

### Issue: Frontend loads but API calls fail
**Solutions:**
1. Verify backend is listening on `0.0.0.0:8082` (not just `localhost:8082`)
2. Check backend CORS configuration allows requests from your network IP
3. Check backend firewall rules
4. Verify backend is accessible: `http://YOUR_IP:8082/api/health` (or similar endpoint)

### Issue: IP address changes frequently
**Solutions:**
1. Configure a static IP address on your router
2. Or use your computer's hostname instead (if DNS is configured)
3. Update the access URL when IP changes

### Issue: Connection refused errors
**Solutions:**
1. Check if ports 4200 and 8082 are already in use:
   ```powershell
   netstat -ano | findstr :4200
   netstat -ano | findstr :8082
   ```
2. Verify firewall rules are active
3. Check if antivirus is blocking connections

## 🔒 Security Considerations

1. **Private Network Only**: This setup is for private networks only. Do not expose these ports to the internet without proper security measures.

2. **Firewall**: Only allow connections on your private network, not from the internet.

3. **HTTPS**: For production, use HTTPS with proper SSL certificates.

4. **Authentication**: Ensure your backend has proper authentication and authorization in place.

## 📝 Quick Reference

- **Frontend Port**: 4200
- **Backend Port**: 8082
- **Frontend URL**: `http://YOUR_IP:4200`
- **Backend API URL**: `http://YOUR_IP:8082/api` (automatically detected by frontend)

## 🎯 Testing

1. Start both servers
2. On the host computer, open: `http://localhost:4200`
3. On another device, open: `http://YOUR_IP:4200`
4. Both should work identically
5. Check browser console for any connection errors

---

**Note**: If your IP address changes, you'll need to update the URL on other devices. Consider setting a static IP address for a more stable setup.

