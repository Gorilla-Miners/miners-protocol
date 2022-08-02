import { ethers, artifacts, network, run } from "hardhat";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const MinerProtocol = await ethers.getContractFactory("MinerProtocol");

  const mockErc20 = await MockERC20.deploy("Binance USD", "BUSD", "100000000000000000000000000000000000");
  const minerProtocol = await MinerProtocol.deploy(mockErc20.address);

  console.log("deployed contract:", minerProtocol.address, '::::', mockErc20.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });