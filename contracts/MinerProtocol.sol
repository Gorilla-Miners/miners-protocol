// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract MinerProtocol is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address public immutable BUSD;
    address public adminAddress = 0x3498071A9EC8710faD0745a3A920454F26f2d6AA;
    mapping(address => UserInfo) public userInfo;

    uint256 public dailyReturnsInBPS = 300;
    uint256 public totalInvestments;
    uint256 public totalPayouts;
    uint256 public adminFee = 5000000000000000000; // 5 dollar
    uint256 public withdrawalFeeInBPS = 250;
    uint256 public minCompoundingAmount = 10000000000000000000;
    uint256 public stakingDuration = 90 days;
    uint256 maxGenerations = 1;

    mapping(address => ReferrerInfo) public referrers;
    mapping(address => uint256) public referralsCount;
    mapping(address => uint256) public totalReferralCommissions;
    uint256 referralCommisionInBPS = 1000;

    struct ReferrerInfo {
        address referrer;
        bool initialReward;
        uint256 totalEarnings;
    }

    struct UserInfo {
        uint256 totalInvestments;
        uint256 lastWithdrawn;
        uint256 amount;
        uint256 debt;
        uint256 initialTime;
        uint256 totalWithdrawal;
        uint256 withdrawnAt;
        uint256 reinvestmentDeadline;
        uint256 lockEndTime;
    }

    event ReferralRecorded(address indexed user, address indexed referrer);
    event ReferralCommissionPaid(
        address indexed user,
        address indexed referrer,
        uint256 commissionAmount
    );
    event ReferralCommissionRecorded(
        address indexed referrer,
        uint256 commission
    );

    constructor(address _busd) {
        BUSD = _busd;
    }

    function clearPreviousStaking(address _account) internal {
        UserInfo memory user = userInfo[_account];
        uint256 _debtAmount = user.debt;
        user.withdrawnAt = 0;
        user.lastWithdrawn = 0;
        user.initialTime = block.timestamp;
        user.lockEndTime = user.initialTime + stakingDuration;
        user.debt = 0;
        userInfo[_account] = user;

        if (_debtAmount > 0) {
            IERC20(BUSD).transfer(_account, _debtAmount);
        }
    }

    function getUserDetails(address _account)
        external
        view
        returns (UserInfo memory, uint256)
    {
        uint256 reward = getRewards(_account);
        UserInfo memory user = userInfo[_account];
        return (user, reward);
    }

    function getRewards(address _account) public view returns (uint256) {
        uint256 pendingReward = 0;
        UserInfo memory user = userInfo[_account];
        if (user.lastWithdrawn > 0) {
            if (user.reinvestmentDeadline < block.timestamp) {
                return 0;
            } else {
                return user.debt;
            }
        }
        if (user.amount > 0) {
            uint256 stakeAmount = user.amount;
            uint256 timeDiff;
            unchecked {
                timeDiff = block.timestamp - user.initialTime;
            }
            if (timeDiff >= stakingDuration) {
                return stakeAmount.mul(dailyReturnsInBPS).div(10000);
            }
            uint256 rewardAmount = (((stakeAmount * dailyReturnsInBPS) /
                10000) * timeDiff) / stakingDuration;
            pendingReward = rewardAmount;
        }

        uint256 pending = user.debt.add(pendingReward);
        return pending;
    }

    function invest(uint256 _amount) external nonReentrant {
        require(adminFee < _amount, "Incorrect request!");

        UserInfo memory user = userInfo[msg.sender];
        uint256 investment = _amount - adminFee;

        if (user.totalInvestments > 0) {
            if (user.lastWithdrawn > 0) {
                if (user.reinvestmentDeadline < block.timestamp) {
                    user.debt = 0;
                } else {
                    uint256 reinvestmentPercent = 50;
                    uint256 _minimumInvestment = user
                        .lastWithdrawn
                        .mul(reinvestmentPercent)
                        .div(100);
                    require(
                        investment >= _minimumInvestment,
                        "Invest at least 50% of your previous earning"
                    );
                }
                clearPreviousStaking(msg.sender);
            } else {
                require(
                    investment >= minCompoundingAmount,
                    "Minimum compounding is 10 busd"
                );
            }
        }

        IERC20(BUSD).transferFrom(msg.sender, address(this), _amount);
        IERC20(BUSD).transfer(adminAddress, adminFee);

        if (user.totalInvestments < 1) {
            user.initialTime = block.timestamp;
            user.lockEndTime = user.initialTime + stakingDuration;
        }

        user.totalInvestments = user.totalInvestments.add(investment);
        user.amount = user.amount.add(investment);
        totalInvestments = totalInvestments.add(investment);

        userInfo[msg.sender] = user;

        payReferrerCommission(msg.sender, investment);
    }

    function withdraw() external nonReentrant {
        UserInfo memory user = userInfo[msg.sender];
        uint256 totalBalance = getRewards(msg.sender) + user.amount;

        require(totalBalance > 0, "withdraw: insufficient amount");
        uint256 _withdrawalAmount = totalBalance;

        if (user.lockEndTime > block.timestamp) {
            user.amount = 0;
            user.debt = 0;
            _withdrawalAmount = _withdrawalAmount.div(2);
            totalPayouts.add(_withdrawalAmount);
            user.lastWithdrawn = 0;
        } else {
            totalPayouts.add(_withdrawalAmount);
            _withdrawalAmount = _withdrawalAmount.mul(70).div(100);
            user.debt = totalBalance.sub(_withdrawalAmount);
            user.amount = 0;
            user.lastWithdrawn = _withdrawalAmount;
            user.reinvestmentDeadline = block.timestamp + 1 days;
        }

        
        user.totalWithdrawal = user.totalWithdrawal.add(_withdrawalAmount);
        user.withdrawnAt = block.timestamp;
        
        userInfo[msg.sender] = user;

        IERC20(BUSD).transfer(
            msg.sender,
            _withdrawalAmount.sub(
                _withdrawalAmount.mul(withdrawalFeeInBPS).div(10000)
            )
        );
    }

    function recordReferral(address _user, address _referrer) public {
        if (
            _user != address(0) &&
            _referrer != address(0) &&
            _user != _referrer &&
            referrers[_user].referrer == address(0)
        ) {
            referrers[_user].referrer = _referrer;
            referralsCount[_referrer] += 1;
            emit ReferralRecorded(_user, _referrer);
        }
    }

    function getReferrer(address _user) public view returns (ReferrerInfo memory) {
        return referrers[_user];
    }

    function calcReferralReward(uint256 _amount)
        private
        view
        returns (uint256)
    {
        return _amount.mul(referralCommisionInBPS).div(10000);
    }

    function payReferrerCommission(address _user, uint256 _transactionAmount)
        internal
    {
        ReferrerInfo memory referrerInfo = getReferrer(_user);
        if (
            referrerInfo.referrer != address(0) &&
            referrerInfo.initialReward == false
        ) {
            uint256 commision = calcReferralReward(_transactionAmount);
            if (IERC20(BUSD).balanceOf(address(this)) > commision) {
                if (commision > 0) {
                    totalReferralCommissions[referrerInfo.referrer] += commision;
                    referrerInfo.initialReward = true;
                    referrers[_user] = referrerInfo;

                    IERC20(BUSD).transfer(referrerInfo.referrer, commision);
                    emit ReferralCommissionRecorded(referrerInfo.referrer, commision);
                    emit ReferralCommissionPaid(
                        _user,
                        referrerInfo.referrer,
                        commision
                    );
                }
            }
        }
    }
}
