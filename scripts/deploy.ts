import { ethers, artifacts, network, run } from "hardhat";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const MinerProtocol = await ethers.getContractFactory("MinerProtocol");

  const minerProtocol = await MinerProtocol.deploy('0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56');

  console.log("deployed contract:", minerProtocol.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });