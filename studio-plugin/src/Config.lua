--[[
  Config — Plugin configuration constants.
]]

local Config = {}

Config.BACKEND_URL = "http://localhost:5000"
Config.API_KEY = ""
Config.PROTOCOL_VERSION = "1.0.0"
Config.PLUGIN_VERSION = "1.7.0"
Config.HEARTBEAT_INTERVAL = 15
Config.RECONNECT_MAX_ATTEMPTS = 5
Config.SESSION_TIMEOUT = 60
Config.PAYLOAD_MAX_SIZE = 1048576

return Config
