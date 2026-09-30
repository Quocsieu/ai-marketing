-- AlterTable
ALTER TABLE `workerexecution` ADD COLUMN `agentStepId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `AgentRun` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `goal` JSON NOT NULL,
    `productInput` JSON NOT NULL,
    `selectedWorkers` JSON NOT NULL,
    `plan` JSON NULL,
    `status` ENUM('PLANNING', 'AWAITING_APPROVAL', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PLANNING',
    `finalOutput` JSON NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AgentRun_userId_status_createdAt_idx`(`userId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentStep` (
    `id` VARCHAR(191) NOT NULL,
    `agentRunId` VARCHAR(191) NOT NULL,
    `workerSlug` VARCHAR(191) NOT NULL,
    `stepOrder` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `input` JSON NOT NULL,
    `output` JSON NULL,
    `decision` JSON NULL,
    `reason` TEXT NOT NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `errorMessage` TEXT NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AgentStep_agentRunId_status_idx`(`agentRunId`, `status`),
    UNIQUE INDEX `AgentStep_agentRunId_stepOrder_key`(`agentRunId`, `stepOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `WorkerExecution_agentStepId_idx` ON `WorkerExecution`(`agentStepId`);

-- AddForeignKey
ALTER TABLE `WorkerExecution` ADD CONSTRAINT `WorkerExecution_agentStepId_fkey` FOREIGN KEY (`agentStepId`) REFERENCES `AgentStep`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentRun` ADD CONSTRAINT `AgentRun_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentStep` ADD CONSTRAINT `AgentStep_agentRunId_fkey` FOREIGN KEY (`agentRunId`) REFERENCES `AgentRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentStep` ADD CONSTRAINT `AgentStep_workerSlug_fkey` FOREIGN KEY (`workerSlug`) REFERENCES `Worker`(`slug`) ON DELETE RESTRICT ON UPDATE CASCADE;
