CREATE TABLE `MetaConnection` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(32) NOT NULL DEFAULT 'meta',
  `accessToken` TEXT NOT NULL,
  `metaUserId` VARCHAR(100) NULL,
  `adAccountId` VARCHAR(100) NULL,
  `adAccountName` VARCHAR(255) NULL,
  `adAccountCurrency` VARCHAR(8) NULL,
  `pageId` VARCHAR(100) NULL,
  `pageName` VARCHAR(255) NULL,
  `scopes` TEXT NOT NULL,
  `expiresAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `MetaConnection_userId_key` (`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MetaOAuthState` (
  `id` VARCHAR(191) NOT NULL,
  `stateHash` VARCHAR(64) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `MetaOAuthState_stateHash_key` (`stateHash`),
  INDEX `MetaOAuthState_expiresAt_idx` (`expiresAt`),
  INDEX `MetaOAuthState_userId_createdAt_idx` (`userId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MetaCampaign` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `connectionId` VARCHAR(191) NULL,
  `agentRunId` VARCHAR(191) NULL,
  `externalCampaignId` VARCHAR(100) NULL,
  `adAccountId` VARCHAR(100) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `objective` VARCHAR(64) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'CREATING',
  `specification` JSON NOT NULL,
  `errorCode` VARCHAR(100) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `MetaCampaign_agentRunId_key` (`agentRunId`),
  UNIQUE INDEX `MetaCampaign_externalCampaignId_key` (`externalCampaignId`),
  INDEX `MetaCampaign_userId_createdAt_idx` (`userId`, `createdAt`),
  INDEX `MetaCampaign_connectionId_status_idx` (`connectionId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MetaConnection`
  ADD CONSTRAINT `MetaConnection_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MetaOAuthState`
  ADD CONSTRAINT `MetaOAuthState_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MetaCampaign`
  ADD CONSTRAINT `MetaCampaign_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `MetaCampaign_connectionId_fkey` FOREIGN KEY (`connectionId`) REFERENCES `MetaConnection` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `MetaCampaign_agentRunId_fkey` FOREIGN KEY (`agentRunId`) REFERENCES `AgentRun` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
