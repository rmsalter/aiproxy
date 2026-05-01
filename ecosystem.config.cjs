module.exports = {
  apps: [
    {
      name: "aiproxy",
      script: "server.cjs",
      env_file: ".env",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000
    }
  ]
};
