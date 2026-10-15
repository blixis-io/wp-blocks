<?php
/**
 * Theme compatibility source.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Theme;

\defined( 'ABSPATH' ) || exit;
/** Supplies the active stylesheet's effective declaration without exposing WordPress to policy tests. */
interface CompatibilityReader {
	/** Current blog and active stylesheet/template identity for request-local caching. */
	public function context_key(): string;
	/** Effective positive version, or null for absent/invalid headers. */
	public function declared(): ?int;
	/** Whether an effective header was present but invalid. */
	public function invalid_declaration(): bool;
	/** Display name of the active stylesheet theme. */
	public function active_theme_name(): string;
}
