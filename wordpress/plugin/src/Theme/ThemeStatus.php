<?php
/**
 * Theme compatibility value.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Theme;

\defined( 'ABSPATH' ) || exit;
/** Immutable compatibility result. */
final class ThemeStatus {
	/** Create the policy.
	 *
	 * @param bool   $compatible Editing eligibility.
	 * @param ?int   $declared Effective version.
	 * @param int    $supported_min Lower contract bound.
	 * @param int    $supported_max Upper contract bound.
	 * @param string $theme Active theme name.
	 * @param string $reason Stable compatibility reason.
	 */
	public function __construct( public readonly bool $compatible, public readonly ?int $declared, public readonly int $supported_min, public readonly int $supported_max, public readonly string $theme, public readonly string $reason ) {}
	/** REST error metadata.
	 *
	 * @return array{reason: string, theme: string, declared: ?int, supportedMin: int, supportedMax: int}
	 */
	public function error_data(): array {
		return [
			'reason'       => $this->reason,
			'theme'        => $this->theme,
			'declared'     => $this->declared,
			'supportedMin' => $this->supported_min,
			'supportedMax' => $this->supported_max,
		];
	}
	/** Status route payload.
	 *
	 * @return array{name: string, compatible: bool, declared: ?int, reason: string, supportedMin: int, supportedMax: int}
	 */
	public function status_data(): array {
		return [
			'name'         => $this->theme,
			'compatible'   => $this->compatible,
			'declared'     => $this->declared,
			'reason'       => $this->reason,
			'supportedMin' => $this->supported_min,
			'supportedMax' => $this->supported_max,
		];
	}
}
