const { formatUnits, parseEther } = require("ethers/lib/utils");
const { artifacts, contract } = require("hardhat");
const { assert, use } = require("chai");
const { constants, expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");

const MockERC20 = artifacts.require("./utils/MockERC20.sol");
const MinerProtocol = artifacts.require("./MinerProtocol.sol");

use(require("chai-as-promised"))
  .should()

contract("MinerProtocol", ([dev, bob, carol, david, erin]) => {
  let minerProtocol;
  let busd;

  beforeEach(async () => {
    // Deploy BUSD
    busd = await MockERC20.new("Binance USD", "BUSD", parseEther("100000000000000000"), { from: dev });

    // Deploy MinerProtocol
    minerProtocol = await MinerProtocol.new(busd.address, { from: dev });

    // Mint and approve all contracts
    for (let thisUser of [dev, bob, carol, david, erin]) {
      await busd.mintTokens(parseEther("2000000"), { from: thisUser });

      await busd.approve(minerProtocol.address, constants.MAX_UINT256, {
        from: thisUser,
      });
    }
  });

  describe("Normal cases for investment", async () => {
    it("User stakes busd", async function () {
      const stakingAmount = '700';
      const investmentFee = "5";
      const referralFee = ((stakingAmount - investmentFee) * 10) / 100;
      const adminAddress = await minerProtocol.adminAddress();

      await minerProtocol.recordReferral(bob, carol, { from: bob });
      let result = await minerProtocol.getReferrer(bob, { from: bob });
      assert.equal(result.referrer, carol);

      result = await minerProtocol.invest(
        parseEther(stakingAmount), { from: bob }
      );

      assert.equal(String(await busd.balanceOf(minerProtocol.address)), parseEther(((stakingAmount - investmentFee) - referralFee).toString()).toString());
      assert.equal(String(await busd.balanceOf(adminAddress)), parseEther(investmentFee).toString());

      await time.increase(864000);

      result = await minerProtocol.getUserDetails(bob);
      assert.equal(String(result[1]), parseEther(('2.316666666666666666').toString()).toString());

      await expectRevert(minerProtocol.invest(
        parseEther("14"), { from: bob }
      ),
        'Minimum compounding is 10 busd',
      );

      await minerProtocol.invest(
        parseEther(stakingAmount), { from: bob }
      );

      // ensure carol does not get commission on every investment
      const initialBalance = 2000000;
      const carolsBalance = initialBalance + referralFee;
      assert.equal(String(await busd.balanceOf(carol)), parseEther(carolsBalance.toString()).toString());
    });
  });

  describe("Withdrawal cases", async () => {
    it("User withdraws investments", async function () {
      const stakingAmount = '700';

      await minerProtocol.invest(
        parseEther(stakingAmount), { from: bob }
      );

      await time.increase(864000);

      await minerProtocol.withdraw({ from: bob });
      let userDetails = await minerProtocol.getUserDetails(bob);
      assert.equal(userDetails[0].totalWithdrawal, 348658334673996913580)

      await minerProtocol.invest(
        parseEther(stakingAmount), { from: bob }
      );

      await time.increase(7776000);

      const oldUserDetails = await minerProtocol.getUserDetails(bob);
      const oldTotalBalance = formatUnits((Number(oldUserDetails[0].amount) + Number(String(oldUserDetails[1]))).toString());

      await minerProtocol.withdraw({ from: bob });
      userDetails = await minerProtocol.getUserDetails(bob);
      // checking for the locked 30 percent
      assert.equal((oldTotalBalance * 30) / 100, formatUnits(userDetails[0].debt))

      const oldDebt = userDetails[0].debt;

      await expectRevert(minerProtocol.invest(
        parseEther('167.03166666666667'), { from: bob }
      ),
        'Invest at least 50% of your previous earning',
      );

      result = await minerProtocol.invest(
        parseEther('255.5475'), { from: bob }
      )

      expectEvent.inTransaction(result.receipt.transactionHash, busd, "Transfer", {
        from: minerProtocol.address,
        to: bob,
        value: oldDebt,
      });
    });
  });
});