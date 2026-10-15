<?php
/**
 * Counting reader for theme compatibility cache tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Tests;

use Blixis\Builder\Theme\CompatibilityReader;

/** Mutable reader that counts declaration reads for cache tests. */
final class CountingCompatibilityReader implements CompatibilityReader {
	/** Cache context fixture.
	 *
	 * @var string
	 */
	public string $key = 'blog-1|theme|parent';
	/** Declared version fixture.
	 *
	 * @var int
	 */
	public int $version = 1;
	/** Number of declaration reads.
	 *
	 * @var int
	 */
	public int $reads = 0;
	/** Fixture context. */
	public function context_key(): string {
		return $this->key;
	}
	/** Count declaration reads. */
	public function declared(): int {
		++$this->reads;
		return $this->version;
	}
	/** The declaration is valid. */
	public function invalid_declaration(): bool {
		return false;
	}
	/** Fixture name. */
	public function active_theme_name(): string {
		return 'Fixture';
	}
}
