<?php
/**
 * CssLimits implementation.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Css;

/** CssLimits contract. */
final class CssLimits {
	public const MAX_VALUE_LENGTH = 2048;
	public const MAX_COMPONENTS   = 256;
	public const MAX_DEPTH        = 8;
	public const MAX_DIGITS       = 10;
}
