# 🦀 SimpleClaw Setup Guide

This guide covers the process of deploying SimpleClaw to a Google Cloud Platform (GCP) Virtual Machine using Terraform and Docker.

## Prerequisites

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed and authenticated.
- [Terraform](https://developer.hashicorp.com/terraform/downloads) installed.
- An OpenAI API Key.

## Phase 1: Infrastructure Deployment (Terraform)

We use Terraform to provision a "Free Tier" eligible `e2-micro` instance on GCP.

1.  **Authenticate GCP**:
    ```bash
    gcloud auth login
    gcloud auth application-default login
    ```

2.  **Configure Project**:
    ```bash
    gcloud config set project [YOUR_PROJECT_ID]
    ```

3.  **Initialize & Apply**:
    Navigate to the `terraform/` directory:
    ```bash
    cd terraform
    terraform init
    terraform apply -var="project_id=[YOUR_PROJECT_ID]"
    ```

4.  **Note the IP**: Terraform will output an `instance_ip`. This is your server's public address.

## Phase 2: Server Configuration

The Terraform script automatically installs Docker and sets up a **2GB Swap file**. The swap is critical because the `e2-micro` only has 1GB of RAM, and the Browser Skill requires more to run Chromium.

1.  **SSH into the VM**:
    ```bash
    gcloud compute ssh simpleclaw-app --zone=us-central1-a
    ```

2.  **Clone the Repository**:
    ```bash
    git clone https://github.com/stancsz/simpleclaw.git
    cd simpleclaw
    ```

3.  **Environment Variables**:
    Create a `.env` file from the example:
    ```bash
    cp .env.example .env
    nano .env
    ```
    Ensure `OPENAI_API_KEY` is set and `ENABLE_BROWSER=true`.

## Phase 3: Launching the Application

We use Docker Compose to run both the management server and the bot worker.

1.  **Start Containers**:
    ```bash
    docker-compose up -d --build
    ```

2.  **Verify**:
    - Access the management UI at `http://[INSTANCE_IP]:3000`.
    - Check logs: `docker-compose logs -f`.

## Phase 4: Testing the Agent

Once running, you can test the Agentic Browser capabilities:
- **CLI**: Use `npx tsx cli/index.ts` (locally or on server) to chat with the agent.
- **Tools**: Try asking *"Go to news.ycombinator.com and tell me the top story."*

---
> [!TIP]
> If you encounter "Out of Memory" errors despite the swap, consider upgrading to an `e2-small` instance.
